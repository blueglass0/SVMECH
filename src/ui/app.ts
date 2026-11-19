import type Phaser from 'phaser';
import * as C from '../career/career';
import type { CareerState, CombatLevel, Contract, Debrief, MissionOutcome } from '../career/types';
import { CHASSIS, type Section } from '../data/chassis';
import { ECONOMY, SHOP_STOCK } from '../data/economy';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import { SECTIONS } from '../game/units/SectionDamage';
import { play } from '../core/audio';
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
  private ammoTarget = 0;
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
              this.ammoTarget = C.ammoCapacity(c.mech).ballistic;
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
    const cap = C.ammoCapacity(c.mech).ballistic;
    const current = c.mech.ammo.ballistic;
    this.ammoTarget = Math.max(current, Math.min(cap, this.ammoTarget));
    const fuel = C.fuelCost(c);
    const blockerFor = () => C.deployBlocker(c, this.ammoTarget);
    const costs = h('div', { class: 'rows' });
    const deployBtn = h('button', { class: 'primary big', onclick: () => this.deploy(k) }, 'Deploy');
    const warn = h('div', { class: 'warn' });
    const ammoOut = h('output');
    const renderCosts = () => {
      const ammo = C.ammoCost(c, this.ammoTarget);
      ammoOut.textContent = `${this.ammoTarget} / ${cap}`;
      costs.replaceChildren(
        row('Fuel', `${C.tonnage(c.mech)} t`, money(-fuel)),
        row('Ammo', `+${this.ammoTarget - current} rounds`, money(-ammo)),
        row('Money after', '', money(c.money - fuel - ammo), 'total'),
      );
      const b = blockerFor();
      warn.textContent = b ?? '';
      deployBtn.disabled = !!b;
    };
    const slider = h('input', {
      type: 'range',
      min: current,
      max: cap,
      step: 10,
      value: this.ammoTarget,
      oninput: (e: Event) => {
        this.ammoTarget = Number((e.target as HTMLInputElement).value);
        renderCosts();
      },
    });
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
        current >= cap
          ? h('div', { class: 'field-label' }, `Ballistic ammo full (${cap})`)
          : h('div', { class: 'field' }, h('div', { class: 'field-label' }, 'Ballistic ammo ', ammoOut), slider),
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

    const t = C.tonnage(m);
    const p = C.powerDraw(m);
    const loadout = h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Loadout'),
      chassis.mounts.map((mount) => {
        const installed = m.weapons.find((w) => w.mount === mount.id);
        const options = [...new Set(c.inventory.filter((id) => WEAPONS[id].family === mount.type))];
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
      meter('Tonnage', t, chassis.maxTonnage, 't'),
      meter('Power', p, chassis.powerOutput, ''),
      h(
        'div',
        { class: 'rows small' },
        row('Heat', `capacity ${chassis.heatCapacity}`, `sheds ${chassis.heatDissipation}/s`),
        row('Ballistic ammo', `${m.ammo.ballistic} loaded`, `max ${C.ammoCapacity(m).ballistic}`),
        row('Mech value', '', money(C.mechValue(m))),
      ),
      check.ok ? null : h('p', { class: 'warn' }, check.problems.join('. ') + '. Fix this before deploying.'),
      h('p', { class: 'muted small' }, 'Buy weapons in the Shop; spare weapons appear in these lists.'),
    );
    return h('div', { class: 'cols' }, armor, loadout);
  }

  // ---------- Shop ----------

  private shopTab(c: CareerState): HTMLElement {
    const buy = h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Buy weapons'),
      SHOP_STOCK.map((id) => {
        const w = WEAPONS[id];
        const cost = C.price(c, w.price);
        return h(
          'div',
          { class: 'shop-row' },
          h('div', null, h('b', null, w.name), h('span', { class: `chip ${w.family}` }, w.family), h('div', { class: 'muted small' }, weaponStats(w))),
          h('button', { class: 'small-btn', disabled: cost > c.money, onclick: () => this.act(() => C.buyWeapon(c, id), `Bought ${w.name}.`) }, `Buy ${money(cost)}`),
        );
      }),
    );
    const sell = h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Spare gear'),
      c.inventory.length === 0
        ? h('p', { class: 'muted small' }, 'Nothing spare. Uninstalled weapons go here (Mech tab); sell them for 60% of their price.')
        : c.inventory.map((id, i) =>
            h(
              'div',
              { class: 'shop-row' },
              h('div', null, h('b', null, WEAPONS[id].name), h('div', { class: 'muted small' }, weaponStats(WEAPONS[id]))),
              h('button', { class: 'small-btn', onclick: () => this.act(() => C.sellWeapon(c, i), `Sold ${WEAPONS[id].name}.`) }, `Sell ${money(C.sellPrice(c, id))}`),
            ),
          ),
    );
    return h('div', { class: 'cols' }, buy, sell);
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

function weaponStats(w: WeaponDef): string {
  const dps = Math.round(w.damage * w.fireRate);
  const ammo = w.ammoPerShot > 0 ? ` · ammo ${w.ammoPerShot}/shot` : ' · no ammo';
  return `${dps} dps · range ${w.range} · heat ${Math.round(w.heat * w.fireRate * 10) / 10}/s · ${w.tonnage} t · power ${w.power}${ammo}`;
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}
