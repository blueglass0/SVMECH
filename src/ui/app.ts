import type Phaser from 'phaser';
import * as C from '../career/career';
import type { CareerState, CombatLevel, Contract, Debrief, MissionOutcome } from '../career/types';
import { CHASSIS, type Section } from '../data/chassis';
import { ECONOMY, SHOP_STOCK } from '../data/economy';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { EQUIPMENT, type EquipmentDef } from '../data/equipment';
import { isEquipment, isWeapon, itemName, itemPrice } from '../data/items';
import { mechStats } from '../game/mechStats';
import { SECTIONS } from '../game/units/SectionDamage';
import { play } from '../core/audio';
import { settings, saveSettings } from '../core/settings';
import { clockTime, h, money, signedMoney } from './h';
import type { MapScene } from '../scenes/MapScene';

type Tab = 'contracts' | 'mech' | 'shop' | 'finance';

const SECTION_NAMES: Record<Section, string> = { torso: 'Torso', leftArm: 'Left arm', rightArm: 'Right arm', legs: 'Legs' };
const LEVELS: CombatLevel[] = ['easy', 'normal', 'hard'];

/**
 * The game outside missions: title, hangar (contracts, mech, shop, finance),
 * debrief and career over. Owns the career state and starts missions.
 */
export class App {
  private career: CareerState | null = C.loadCareer();
  private screen: HTMLElement;
  private tab: Tab = 'contracts';
  private selectedContract: number | null = null;
  private ammoTarget = { ballistic: 0, missile: 0 };
  private flash = '';
  private inMission = false;
  private quick = new URLSearchParams(window.location.search).has('quick');

  constructor(
    private game: Phaser.Game,
    container: HTMLElement,
  ) {
    this.screen = h('div', { class: 'screen' });
    container.appendChild(this.screen);
    // Deferred: the event fires mid-update, and stopping the scene inside its own update breaks it.
    game.events.on('mission-end', (o: MissionOutcome) => setTimeout(() => this.onMissionEnd(o), 0));
  }

  /** Called once the art is baked. */
  start(): void {
    if (this.quick) {
      this.startQuickMission();
      return;
    }
    if (this.career && C.resolveInterruptedMission(this.career)) {
      this.flash = 'The last mission was interrupted and counted as a withdrawal.';
      this.save();
    }
    this.showTitle();
  }

  get missionRunning(): boolean {
    return this.inMission;
  }

  // ---------- Screens ----------

  private show(content: HTMLElement): void {
    this.screen.replaceChildren(content);
    this.screen.classList.add('open');
    document.body.classList.toggle('in-mission', false);
  }

  private hide(): void {
    this.screen.classList.remove('open');
    this.screen.replaceChildren();
  }

  showTitle(): void {
    const c = this.career;
    let combat: CombatLevel = 'normal';
    let economy: CombatLevel = 'normal';
    const picker = (label: string, help: string, get: () => CombatLevel, set: (l: CombatLevel) => void) => {
      const row = h('div', { class: 'seg' });
      const render = () =>
        row.replaceChildren(
          ...LEVELS.map((l) =>
            h('button', { type: 'button', class: get() === l ? 'on' : '', onclick: () => (set(l), render()) }, cap(l)),
          ),
        );
      render();
      return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label, h('span', { class: 'muted' }, ` · ${help}`)), row);
    };
    const newCareerBox = h(
      'div',
      { class: 'panel new-career', hidden: !!c && !c.over },
      h('h3', null, 'New career'),
      picker('Combat', 'enemy numbers, accuracy and damage', () => combat, (l) => (combat = l)),
      picker('Economy', 'costs, payouts, loans, bankruptcy', () => economy, (l) => (economy = l)),
      h(
        'button',
        {
          class: 'primary big',
          onclick: () => {
            if (c && !c.over && !confirm('Start a new career? Your current career will be lost.')) return;
            this.career = C.newCareer(combat, economy);
            this.save();
            this.tab = 'contracts';
            this.showHangar();
          },
        },
        'Start career',
      ),
    );
    this.show(
      h(
        'div',
        { class: 'title' },
        h('h1', null, 'Steel Vulture'),
        h('p', { class: 'muted' }, 'Mercenary mech pilot. Take contracts, keep your mech running, stay out of debt.'),
        c && !c.over
          ? h(
              'div',
              { class: 'panel' },
              h('button', { class: 'primary big', onclick: () => this.showHangar() }, 'Continue career'),
              h('p', { class: 'muted small' }, `${money(c.money)} · ${c.stats.missions} missions · ${CHASSIS[c.mech.chassis].name}`),
              h('button', { class: 'link', onclick: () => (newCareerBox.hidden = !newCareerBox.hidden) }, 'or start a new career'),
            )
          : null,
        newCareerBox,
      ),
    );
  }

  showHangar(tab: Tab = this.tab): void {
    const c = this.career;
    if (!c) return this.showTitle();
    if (c.over) return this.showCareerOver();
    this.tab = tab;
    const tabs: [Tab, string][] = [
      ['contracts', 'Contracts'],
      ['mech', C.totalRepairCost(c) > 0 || c.mech.destroyed ? 'Mech •' : 'Mech'],
      ['shop', 'Shop'],
      ['finance', 'Finance'],
    ];
    const body =
      tab === 'contracts' ? this.contractsTab(c) : tab === 'mech' ? this.mechTab(c) : tab === 'shop' ? this.shopTab(c) : this.financeTab(c);
    const flash = this.flash;
    this.flash = '';
    this.show(
      h(
        'div',
        { class: 'hangar' },
        h(
          'header',
          { class: 'hdr' },
          h('span', { class: 'brand' }, 'Steel Vulture'),
          h('span', { class: 'money' }, money(c.money)),
          c.loan ? h('span', { class: 'debt' }, `Loan ${money(c.loan.remaining)}`) : null,
        ),
        h(
          'nav',
          { class: 'tabs' },
          tabs.map(([t, label]) => h('button', { type: 'button', class: t === tab ? 'on' : '', onclick: () => this.showHangar(t) }, label)),
        ),
        flash ? h('div', { class: 'flash' }, flash) : null,
        h('div', { class: 'body' }, body),
      ),
    );
  }

  // ---------- Contracts ----------

  private contractsTab(c: CareerState): HTMLElement {
    if (this.selectedContract !== null) {
      const contract = c.contracts.find((x) => x.id === this.selectedContract);
      if (contract) return this.deployPanel(c, contract);
      this.selectedContract = null;
    }
    return h(
      'div',
      { class: 'cards' },
      c.contracts.map((k) =>
        h(
          'button',
          {
            type: 'button',
            class: `card tier${k.tier}`,
            onclick: () => {
              this.selectedContract = k.id;
              this.ammoTarget = { ...C.ammoCapacity(c.mech) };
              this.showHangar('contracts');
            },
          },
          h('div', { class: 'card-top' }, h('span', { class: 'tier' }, `${ECONOMY.tiers[k.tier].name}`), h('span', { class: 'pay' }, money(k.payout))),
          h('div', { class: 'card-title' }, `${k.employer}`),
          h('div', { class: 'muted small' }, `vs ${k.enemy} · destroy ${k.targets} uplinks`),
          h('div', { class: 'small bonus' }, `Bonus +${money(C.bonusPayout(k))}: ${k.bonus.label}`),
        ),
      ),
    );
  }

  private deployPanel(c: CareerState, k: Contract): HTMLElement {
    const cap = C.ammoCapacity(c.mech);
    const current = { ballistic: c.mech.ammo.ballistic, missile: c.mech.ammo.missile ?? 0 };
    const t = this.ammoTarget;
    t.ballistic = Math.max(current.ballistic, Math.min(cap.ballistic, t.ballistic));
    t.missile = Math.max(current.missile, Math.min(cap.missile, t.missile));
    const fuel = C.fuelCost(c);
    const costs = h('div', { class: 'rows' });
    const deployBtn = h('button', { class: 'primary big', onclick: () => this.deploy(k) }, 'Deploy');
    const warn = h('div', { class: 'warn' });
    const outs = { ballistic: h('output'), missile: h('output') };
    const renderCosts = () => {
      const ammo = C.ammoCost(c, t);
      outs.ballistic.textContent = `${t.ballistic} / ${cap.ballistic}`;
      outs.missile.textContent = `${t.missile} / ${cap.missile}`;
      costs.replaceChildren(
        row('Fuel', `${C.tonnage(c.mech)} t`, money(-fuel)),
        row('Ammo', `+${t.ballistic - current.ballistic} rounds${cap.missile > 0 ? `, +${t.missile - current.missile} missiles` : ''}`, money(-ammo)),
        row('Money after', '', money(c.money - fuel - ammo), 'total'),
      );
      const b = C.deployBlocker(c, t);
      warn.textContent = b ?? '';
      deployBtn.disabled = !!b;
    };
    const ammoField = (kind: 'ballistic' | 'missile', label: string, step: number) =>
      current[kind] >= cap[kind]
        ? h('div', { class: 'field-label' }, `${label} full (${cap[kind]})`)
        : h(
            'div',
            { class: 'field' },
            h('div', { class: 'field-label' }, `${label} `, outs[kind]),
            h('input', {
              type: 'range',
              min: current[kind],
              max: cap[kind],
              step,
              value: t[kind],
              oninput: (e: Event) => {
                t[kind] = Number((e.target as HTMLInputElement).value);
                renderCosts();
              },
            }),
          );
    const ammoFields = [ammoField('ballistic', 'Ballistic ammo', 10), cap.missile > 0 ? ammoField('missile', 'Missiles', 2) : null];
    renderCosts();

    const damaged = SECTIONS.filter((s) => C.sectionRepairCost(c, s) > 0);
    return h(
      'div',
      { class: 'deploy' },
      h(
        'div',
        { class: 'panel' },
        h('div', { class: 'card-top' }, h('span', { class: 'tier' }, ECONOMY.tiers[k.tier].name), h('span', { class: 'pay' }, money(k.payout))),
        h('h3', null, k.employer),
        h('p', { class: 'muted' }, k.flavor),
        h('div', { class: 'rows' }, row('Objective', `Destroy ${k.targets} uplink towers`, ''), row('Bonus', k.bonus.label, `+${money(C.bonusPayout(k))}`)),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Prepare'),
        ammoFields,
        costs,
        damaged.length > 0 && !c.mech.destroyed
          ? h('p', { class: 'warn' }, `Damaged: ${damaged.map((s) => SECTION_NAMES[s]).join(', ')}. Repair in the Mech tab, or deploy as is.`)
          : null,
        warn,
        h('div', { class: 'actions' }, h('button', { onclick: () => ((this.selectedContract = null), this.showHangar('contracts')) }, 'Back'), deployBtn),
      ),
    );
  }

  private deploy(k: Contract): void {
    const c = this.career!;
    const config = C.deploy(c, k.id, this.ammoTarget);
    if (!config) return;
    this.save();
    this.selectedContract = null;
    play('ui', 1);
    this.startMission(config);
  }

  private startMission(config: object): void {
    this.inMission = true;
    this.hide();
    document.body.classList.add('in-mission');
    this.game.scene.start('Map', config);
    this.game.scene.start('Hud');
  }

  private startQuickMission(): void {
    this.startMission({});
  }

  // ---------- Mech ----------

  private mechTab(c: CareerState): HTMLElement {
    const m = c.mech;
    const chassis = CHASSIS[m.chassis];
    const check = C.checkLoadout(m);

    const armor = h(
      'div',
      { class: 'panel' },
      h('h3', null, `${chassis.name} · ${chassis.weightClass} ${chassis.tonnage} t`),
      m.destroyed
        ? h(
            'div',
            { class: 'destroyed' },
            h('p', { class: 'warn' }, 'Destroyed in battle. Rebuild it to deploy again.'),
            h(
              'button',
              { class: 'primary', disabled: C.rebuildCost(c) > c.money, onclick: () => this.act(() => C.rebuild(c), 'Mech rebuilt.') },
              `Rebuild ${money(C.rebuildCost(c))}`,
            ),
            C.rebuildCost(c) > c.money ? h('p', { class: 'muted small' }, 'Not enough money: sell spare gear or take a loan (Finance).') : null,
          )
        : [
            ...SECTIONS.map((s) => {
              const max = chassis.sections[s];
              const hp = m.sections[s];
              const cost = C.sectionRepairCost(c, s);
              const f = hp / max;
              return h(
                'div',
                { class: 'armor-row' },
                h('span', null, SECTION_NAMES[s]),
                h('span', { class: 'bar' }, h('i', { style: `width:${f * 100}%`, class: f <= 0 ? 'dead' : f < 0.25 ? 'crit' : f < 0.5 ? 'low' : '' })),
                h('span', { class: 'num' }, hp <= 0 ? 'destroyed' : `${Math.round(hp)}/${max}`),
                cost > 0
                  ? h('button', { class: 'small-btn', disabled: cost > c.money, onclick: () => this.act(() => C.repairSection(c, s)) }, `Repair ${money(cost)}`)
                  : h('span', { class: 'muted small' }, 'OK'),
              );
            }),
            C.totalRepairCost(c) > 0
              ? h(
                  'button',
                  { class: 'primary', disabled: C.totalRepairCost(c) > c.money, onclick: () => this.act(() => C.repairAll(c), 'Repaired.') },
                  `Repair all ${money(C.totalRepairCost(c))}`,
                )
              : null,
          ],
    );

    const st = mechStats(m);
    const loadout = h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Loadout'),
      chassis.mounts.map((mount) => {
        const installed = m.weapons.find((w) => w.mount === mount.id);
        const options = [...new Set(c.inventory.filter((id) => WEAPONS[id]?.family === mount.type))];
        const select = h(
          'select',
          {
            onchange: (e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              this.act(() => (v === '' ? C.uninstall(c, mount.id) : C.install(c, mount.id, v)));
            },
          },
          h('option', { value: '' }, '— empty —'),
          installed ? h('option', { value: installed.weapon, selected: true }, WEAPONS[installed.weapon].name) : null,
          options.filter((id) => id !== installed?.weapon).map((id) => h('option', { value: id }, `${WEAPONS[id].name} (spare)`)),
        );
        return h(
          'div',
          { class: 'mount-row' },
          h('span', null, `${SECTION_NAMES[mount.section]}`, h('span', { class: `chip ${mount.type}` }, mount.type)),
          select,
          installed
            ? h(
                'span',
                { class: 'seg small' },
                ([1, 2] as const).map((g) =>
                  h('button', { type: 'button', class: installed.group === g ? 'on' : '', onclick: () => this.act(() => C.setGroup(c, mount.id, g)) }, `G${g}`),
                ),
              )
            : h('span'),
        );
      }),
      meter('Tonnage', st.tonnage, st.maxTonnage, 't'),
      meter('Power', st.powerDraw, st.powerOutput, ''),
      meter('Slots', st.slotsUsed, st.slots, ''),
      h(
        'div',
        { class: 'rows small' },
        row('Heat', `capacity ${st.heatCapacity}, reactor +${st.passiveHeat}/s`, `sheds ${st.dissipation}/s`),
        row('Ammo', `${m.ammo.ballistic} rounds, ${m.ammo.missile ?? 0} missiles`, `max ${st.ammoCapacity.ballistic} / ${st.ammoCapacity.missile}`),
        row('Mech value', '', money(C.mechValue(m))),
      ),
      check.ok ? null : h('p', { class: 'warn' }, check.problems.join('. ') + '. Fix this before deploying.'),
      h('p', { class: 'muted small' }, 'Buy weapons and equipment in the Shop; spares appear here.'),
    );

    const spareEquipment = [...new Set(c.inventory.filter((id) => isEquipment(id)))];
    const equipment = h(
      'div',
      { class: 'panel' },
      h('h3', null, `Internal equipment · ${st.slotsUsed}/${st.slots} slots`),
      m.equipment.map((id, i) =>
        h(
          'div',
          { class: 'shop-row' },
          h('div', null, h('b', null, EQUIPMENT[id].name), h('div', { class: 'muted small' }, equipmentStats(EQUIPMENT[id]))),
          h('button', { class: 'small-btn', onclick: () => this.act(() => C.removeEquipment(c, i)) }, 'Remove'),
        ),
      ),
      spareEquipment.length > 0
        ? h(
            'div',
            { class: 'mount-row' },
            h('span', null, 'Add'),
            h(
              'select',
              { onchange: (e: Event) => this.act(() => C.installEquipment(c, (e.target as HTMLSelectElement).value)) },
              h('option', { value: '' }, '— choose spare equipment —'),
              spareEquipment.map((id) => h('option', { value: id }, `${EQUIPMENT[id].name} (${EQUIPMENT[id].slots} slot${EQUIPMENT[id].slots > 1 ? 's' : ''})`)),
            ),
            h('span'),
          )
        : h('p', { class: 'muted small' }, 'Buy equipment in the Shop to fit it here. Installing a reactor swaps out the old one.'),
    );
    return h('div', { class: 'cols' }, armor, loadout, equipment);
  }

  // ---------- Shop ----------

  private shopTab(c: CareerState): HTMLElement {
    const item = (id: string) => {
      const cost = C.price(c, itemPrice(id));
      const w = WEAPONS[id];
      const e = EQUIPMENT[id];
      return h(
        'div',
        { class: 'shop-row' },
        h(
          'div',
          null,
          h('b', null, itemName(id)),
          w ? h('span', { class: `chip ${w.family}` }, w.family) : h('span', { class: 'chip' }, `${e.slots} slot${e.slots > 1 ? 's' : ''}`),
          h('div', { class: 'muted small' }, w ? weaponStats(w) : equipmentStats(e)),
        ),
        h('button', { class: 'small-btn', disabled: cost > c.money, onclick: () => this.act(() => C.buyItem(c, id), `Bought ${itemName(id)}.`) }, `Buy ${money(cost)}`),
      );
    };
    const weapons = h('div', { class: 'panel' }, h('h3', null, 'Weapons'), SHOP_STOCK.filter(isWeapon).map(item));
    const equipment = h('div', { class: 'panel' }, h('h3', null, 'Equipment'), SHOP_STOCK.filter(isEquipment).map(item));
    const sell = h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Spare gear'),
      c.inventory.length === 0
        ? h('p', { class: 'muted small' }, 'Nothing spare. Removed weapons and equipment go here; sell them for 60% of their price.')
        : c.inventory.map((id, i) =>
            h(
              'div',
              { class: 'shop-row' },
              h('div', null, h('b', null, itemName(id)), h('div', { class: 'muted small' }, WEAPONS[id] ? weaponStats(WEAPONS[id]) : equipmentStats(EQUIPMENT[id]))),
              h('button', { class: 'small-btn', onclick: () => this.act(() => C.sellItem(c, i), `Sold ${itemName(id)}.`) }, `Sell ${money(C.sellPrice(c, id))}`),
            ),
          ),
    );
    return h('div', { class: 'cols' }, weapons, equipment, sell);
  }

  // ---------- Finance ----------

  private financeTab(c: CareerState): HTMLElement {
    const loan = c.loan
      ? h(
          'div',
          { class: 'rows' },
          row('Borrowed', '', money(c.loan.principal)),
          row('Still owed', '', money(c.loan.remaining)),
          row('Installment', `after each mission · ${c.loan.paymentsLeft} left`, money(c.loan.installment)),
          h('p', { class: 'muted small' }, 'One loan at a time. Miss a payment with nothing left to sell and your career ends.'),
        )
      : h(
          'div',
          null,
          h('p', { class: 'muted small' }, 'Cash now, repaid with interest in installments after each mission. One loan at a time.'),
          ECONOMY.loan.amounts.map((a) => {
            const t = C.loanTerms(c, a);
            return h(
              'div',
              { class: 'shop-row' },
              h('div', null, h('b', null, money(a)), h('div', { class: 'muted small' }, `Repay ${money(t.total)} in ${t.installments} × ${money(t.installment)}`)),
              h(
                'button',
                { class: 'small-btn', onclick: () => confirm(`Borrow ${money(a)} and repay ${money(t.total)}?`) && this.act(() => C.takeLoan(c, a), 'Loan taken.') },
                'Take loan',
              ),
            );
          }),
        );
    return h(
      'div',
      { class: 'cols' },
      h('div', { class: 'panel' }, h('h3', null, 'Loan'), loan),
      h(
        'div',
        { class: 'panel' },
        h('h3', null, 'Career'),
        h(
          'div',
          { class: 'rows' },
          row('Missions', `${c.stats.wins} won`, String(c.stats.missions)),
          row('Earned', '', money(c.stats.earned)),
          row('Spent', '', money(c.stats.spent)),
          row('Difficulty', `combat ${c.difficulty.combat}`, `economy ${c.difficulty.economy}`),
        ),
        h('button', { class: 'link danger', onclick: () => this.showTitle() }, 'Title screen / new career'),
      ),
    );
  }

  // ---------- After a mission ----------

  private onMissionEnd(o: MissionOutcome): void {
    this.inMission = false;
    this.game.scene.stop('Map');
    this.game.scene.stop('Hud');
    if (this.quick || !this.career) {
      this.startQuickMission();
      return;
    }
    const contract = this.career.contracts.find((k) => k.id === this.career!.activeContract);
    if (!contract) return this.showHangar();
    const d = C.completeMission(this.career, contract, o);
    this.save();
    this.showDebrief(d);
  }

  private showDebrief(d: Debrief): void {
    const o = d.outcome;
    const c = this.career!;
    const accuracy = o.shots > 0 ? Math.round((o.hits / o.shots) * 100) : 0;
    const title = o.won ? 'Mission complete' : o.withdrew ? 'Withdrew' : o.mech.destroyed ? 'Mech destroyed' : 'Mission failed';
    const repairs = C.totalRepairCost(c);
    this.show(
      h(
        'div',
        { class: `debrief ${o.won ? 'won' : 'lost'}` },
        h('h1', null, title),
        h('p', { class: 'muted' }, `${d.contract.employer} · ${o.targetsDestroyed}/${o.targetsTotal} uplinks · ${clockTime(o.time)}`),
        h(
          'div',
          { class: 'cols' },
          h(
            'div',
            { class: 'panel' },
            h('h3', null, 'Pay'),
            h('div', { class: 'rows' }, d.lines.map((l) => row(l.label, '', signedMoney(l.amount))), row('Net', '', signedMoney(d.net), 'total'), row('Money', '', money(d.moneyAfter), 'total')),
            d.notes.map((n) => h('p', { class: 'warn' }, n)),
            c.overReason && !c.over ? h('p', { class: 'warn' }, c.overReason) : null,
          ),
          h(
            'div',
            { class: 'panel' },
            h('h3', null, 'Battle'),
            h(
              'div',
              { class: 'rows' },
              row('Enemies destroyed', '', String(o.kills)),
              row('Damage dealt', '', String(Math.round(o.damageDealt))),
              row('Damage taken', '', String(Math.round(o.damageTaken))),
              row('Accuracy', `${o.hits}/${o.shots}`, `${accuracy}%`),
              row('Ammo used', '', String(o.ammoUsed)),
              row(o.mech.destroyed ? 'Rebuild cost' : 'Repairs needed', '', money(o.mech.destroyed ? C.rebuildCost(c) : repairs)),
            ),
          ),
        ),
        h('div', { class: 'actions' }, h('button', { class: 'primary big', onclick: () => this.showHangar(c.mech.destroyed || repairs > 0 ? 'mech' : 'contracts') }, 'Return to hangar')),
      ),
    );
    if (c.overReason && !c.over) c.overReason = undefined;
    play('ui', 1);
  }

  private showCareerOver(): void {
    const c = this.career!;
    this.show(
      h(
        'div',
        { class: 'debrief lost' },
        h('h1', null, 'Career over'),
        h('p', null, c.overReason ?? 'You went bankrupt.'),
        h('div', { class: 'panel' }, h('div', { class: 'rows' }, row('Missions', `${c.stats.wins} won`, String(c.stats.missions)), row('Earned', '', money(c.stats.earned)))),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            {
              class: 'primary big',
              onclick: () => {
                C.deleteCareer();
                this.career = null;
                this.showTitle();
              },
            },
            'Start a new career',
          ),
        ),
      ),
    );
  }

  // ---------- In-mission pause ----------

  pauseMenu(): void {
    if (!this.inMission) return;
    const map = this.game.scene.getScene('Map') as MapScene;
    map.releaseInput();
    this.game.scene.pause('Map');
    const close = () => {
      overlay.remove();
      this.game.scene.resume('Map');
    };
    const overlay = h(
      'div',
      { class: 'screen open pause' },
      h(
        'div',
        { class: 'panel narrow' },
        h('h3', null, 'Paused'),
        h('button', { class: 'primary big', onclick: close }, 'Resume'),
        h(
          'button',
          {
            class: 'danger',
            onclick: () => {
              close();
              map.withdraw();
            },
          },
          'Withdraw from mission',
        ),
        h(
          'button',
          {
            onclick: (e: Event) => {
              settings.fog = settings.fog === 'faded' ? 'dark' : 'faded';
              saveSettings();
              (e.target as HTMLButtonElement).textContent = fogLabel();
            },
          },
          fogLabel(),
        ),
        h('p', { class: 'muted small' }, "Withdrawing fails the contract: no pay, and fuel and ammo are already spent. Your mech comes home as it is."),
      ),
    );
    this.screen.parentElement!.appendChild(overlay);
  }

  // ---------- Dev ----------

  devAddMoney(amount: number): void {
    if (!this.career) return;
    this.career.money += amount;
    this.save();
    if (!this.inMission) this.showHangar();
  }

  // ---------- Helpers ----------

  /** Run a career action, save, and redraw the current tab. */
  private act(fn: () => unknown, message = ''): void {
    const c = this.career!;
    fn();
    C.checkCareerOver(c);
    this.save();
    if (message) this.flash = message;
    play('ui', 0.6);
    this.showHangar();
  }

  private save(): void {
    if (this.career) C.saveCareer(this.career);
  }
}

function fogLabel(): string {
  return `Outside your vision: ${settings.fog === 'faded' ? 'terrain faded' : 'dark'}`;
}

function row(label: string, detail: string, value: string, cls = ''): HTMLElement {
  return h('div', { class: `row ${cls}` }, h('span', null, label, detail ? h('span', { class: 'muted small' }, ` ${detail}`) : null), h('span', { class: 'num' }, value));
}

function meter(label: string, value: number, max: number, unit: string): HTMLElement {
  const over = value > max;
  return h(
    'div',
    { class: 'meter' },
    h('span', null, label),
    h('span', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (value / max) * 100)}%`, class: over ? 'crit' : '' })),
    h('span', { class: `num ${over ? 'bad' : ''}` }, `${value} / ${max}${unit ? ' ' + unit : ''}`),
  );
}

function equipmentStats(e: EquipmentDef): string {
  const parts: string[] = [];
  if (e.output) parts.push(`power ${e.output}`, `heat +${e.passiveHeat}/s`);
  if (e.dissipation) parts.push(`sheds ${e.dissipation} heat/s`);
  if (e.armor) parts.push(`+${e.armor.torso + e.armor.leftArm + e.armor.rightArm + e.armor.legs} armor`);
  if (e.ammo) parts.push(e.ammo.ballistic ? `+${e.ammo.ballistic} rounds` : `+${e.ammo.missile} missiles`);
  if (e.shield) parts.push(`absorbs ${e.shield.capacity} for ${e.shield.duration}s (+${e.shield.heatPerSecond} heat/s), every ${e.shield.cooldown}s`);
  if (e.flares) parts.push(`${e.flares.charges} flares per mission, break missile locks`);
  if (e.pointDefense) parts.push(`shoots missiles within ${e.pointDefense.range}`);
  if (e.sensors) parts.push(`vision +${e.sensors.range} range, +${e.sensors.coneDeg}° cone${e.sensors.radar ? `, radar ${e.sensors.radar}` : ''}`);
  parts.push(`${e.tonnage} t`);
  if (e.power) parts.push(`draws ${e.power} power`);
  return parts.join(' · ');
}

function weaponStats(w: WeaponDef): string {
  if (w.missile) {
    return `${w.missile.salvo}× ${w.damage} dmg every ${Math.round(10 / w.fireRate) / 10}s · ${w.missile.turnRate > 0 ? 'seeking' : 'unguided'} · range ${w.range} · ${w.tonnage} t · power ${w.power} · ${w.ammoPerShot} missiles/salvo`;
  }
  const dps = Math.round(w.damage * w.fireRate);
  const ammo = w.ammoPerShot > 0 ? ` · ammo ${w.ammoPerShot}/shot` : ' · no ammo';
  return `${dps} dps · range ${w.range} · heat ${Math.round(w.heat * w.fireRate * 10) / 10}/s · ${w.tonnage} t · power ${w.power}${ammo}`;
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}
