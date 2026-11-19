import { CHASSIS, type Section } from '../data/chassis';
import { COMBAT_DIFFICULTY } from '../data/difficulty';
import { CONTRACT_FLAVOR, ECONOMY, ECONOMY_DIFFICULTY, EMPLOYERS, ENEMY_FORCES, SHOP_STOCK } from '../data/economy';
import { STARTER_LOADOUT } from '../data/loadouts';
import { WEAPONS } from '../data/weapons';
import { EQUIPMENT } from '../data/equipment';
import { itemName, itemPrice, isEquipment } from '../data/items';
import { mechStats } from '../game/mechStats';
import { SECTIONS } from '../game/units/SectionDamage';
import { randomSeed } from '../core/rng';
import type {
  BonusObjective,
  CareerState,
  CombatLevel,
  Contract,
  Debrief,
  DebriefLine,
  MechState,
  MissionConfig,
  MissionOutcome,
} from './types';

/**
 * Career rules: money, upkeep, contracts, shop, loadout limits, loans and
 * career over. Pure logic on a `CareerState`; the UI calls these and saves.
 */

const SAVE_KEY = 'steel-vulture.career.v1';

// ---------- Persistence ----------

export function loadCareer(): CareerState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CareerState;
    if (s.version !== 1) return null;
    // Saves from before equipment existed (M5): give the mech the starter reactor and heat sink.
    if (!s.mech.equipment) s.mech.equipment = [...STARTER_LOADOUT.equipment];
    normalizeMech(s);
    return s;
  } catch {
    return null;
  }
}

export function saveCareer(s: CareerState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked or full: the career just won't persist.
  }
}

export function deleteCareer(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}

export function newCareer(combat: CombatLevel, economy: CombatLevel): CareerState {
  const chassis = CHASSIS[STARTER_LOADOUT.chassis];
  const s: CareerState = {
    version: 1,
    money: ECONOMY.startingMoney,
    loan: null,
    mech: {
      chassis: chassis.id,
      weapons: STARTER_LOADOUT.weapons.map((w) => ({ ...w })),
      equipment: [...STARTER_LOADOUT.equipment],
      sections: { ...chassis.sections },
      ammo: { ...chassis.ammoCapacity },
      destroyed: false,
    },
    inventory: [],
    contracts: [],
    difficulty: { combat, economy },
    stats: { missions: 0, wins: 0, earned: 0, spent: 0 },
    nextContractId: 1,
    activeContract: null,
    over: false,
  };
  refreshContracts(s);
  return s;
}

/** On load: a mission that was running when the page closed counts as a withdrawal (no pay). */
export function resolveInterruptedMission(s: CareerState): boolean {
  if (s.activeContract === null) return false;
  s.activeContract = null;
  s.stats.missions++;
  refreshContracts(s);
  checkCareerOver(s);
  return true;
}

// ---------- Prices ----------

function econ(s: CareerState) {
  return ECONOMY_DIFFICULTY[s.difficulty.economy];
}

export function price(s: CareerState, base: number): number {
  return Math.round(base * econ(s).costs);
}

export function sellPrice(s: CareerState, itemId: string): number {
  return Math.round(price(s, itemPrice(itemId)) * ECONOMY.sellFraction);
}

// ---------- Mech and loadout ----------

export function tonnage(m: MechState): number {
  return mechStats(m).tonnage;
}

export function powerDraw(m: MechState): number {
  return mechStats(m).powerDraw;
}

export interface LoadoutCheck {
  ok: boolean;
  problems: string[];
}

export function checkLoadout(m: MechState): LoadoutCheck {
  const st = mechStats(m);
  const problems: string[] = [];
  if (st.reactors.length !== 1) problems.push(st.reactors.length === 0 ? 'No reactor installed' : 'Only one reactor allowed');
  if (st.tonnage > st.maxTonnage) problems.push(`Too heavy: ${st.tonnage} / ${st.maxTonnage} t`);
  if (st.powerDraw > st.powerOutput) problems.push(`Not enough power: ${st.powerDraw} / ${st.powerOutput}`);
  if (st.slotsUsed > st.slots) problems.push(`Too many internal slots used: ${st.slotsUsed} / ${st.slots}`);
  if (m.weapons.length === 0) problems.push('No weapons installed');
  return { ok: problems.length === 0, problems };
}

export function ammoCapacity(m: MechState): { ballistic: number; missile: number } {
  return mechStats(m).ammoCapacity;
}

export function mechValue(m: MechState): number {
  return (
    CHASSIS[m.chassis].price +
    m.weapons.reduce((t, w) => t + WEAPONS[w.weapon].price, 0) +
    m.equipment.reduce((t, id) => t + itemPrice(id), 0)
  );
}

/** Keep armor and ammo within the current loadout's limits (after removing plating or bins). */
export function normalizeMech(s: CareerState): void {
  const st = mechStats(s.mech);
  for (const sec of SECTIONS) s.mech.sections[sec] = Math.min(s.mech.sections[sec], st.sections[sec]);
  s.mech.ammo.ballistic = Math.min(s.mech.ammo.ballistic, st.ammoCapacity.ballistic);
  s.mech.ammo.missile = Math.min(s.mech.ammo.missile ?? 0, st.ammoCapacity.missile);
}

export function sectionRepairCost(s: CareerState, section: Section): number {
  const m = s.mech;
  const max = mechStats(m).sections[section];
  const missing = max - m.sections[section];
  if (missing <= 0) return 0;
  const mult = m.sections[section] <= 0 ? ECONOMY.destroyedSectionMultiplier : 1;
  return price(s, missing * ECONOMY.repairPerArmor * mult);
}

export function totalRepairCost(s: CareerState): number {
  return SECTIONS.reduce((t, sec) => t + sectionRepairCost(s, sec), 0);
}

export function repairSection(s: CareerState, section: Section): boolean {
  const cost = sectionRepairCost(s, section);
  if (cost === 0 || cost > s.money || s.mech.destroyed) return false;
  spend(s, cost);
  s.mech.sections[section] = mechStats(s.mech).sections[section];
  return true;
}

export function repairAll(s: CareerState): boolean {
  const cost = totalRepairCost(s);
  if (cost === 0 || cost > s.money || s.mech.destroyed) return false;
  for (const sec of SECTIONS) repairSection(s, sec);
  return true;
}

export function rebuildCost(s: CareerState): number {
  return price(s, mechValue(s.mech) * ECONOMY.rebuildFraction);
}

export function rebuild(s: CareerState): boolean {
  const cost = rebuildCost(s);
  if (!s.mech.destroyed || cost > s.money) return false;
  spend(s, cost);
  s.mech.destroyed = false;
  s.mech.sections = { ...mechStats(s.mech).sections };
  return true;
}

// ---------- Shop and installing ----------

export function buyItem(s: CareerState, id: string): boolean {
  const cost = price(s, itemPrice(id));
  if (!SHOP_STOCK.includes(id) || cost > s.money) return false;
  spend(s, cost);
  s.inventory.push(id);
  return true;
}

export function sellItem(s: CareerState, inventoryIndex: number): boolean {
  const id = s.inventory[inventoryIndex];
  if (!id) return false;
  s.inventory.splice(inventoryIndex, 1);
  earn(s, sellPrice(s, id));
  return true;
}

/** Install owned equipment. A new reactor replaces the old one (which goes to inventory). */
export function installEquipment(s: CareerState, id: string): boolean {
  const idx = s.inventory.indexOf(id);
  if (idx < 0 || !isEquipment(id)) return false;
  if (EQUIPMENT[id].kind === 'reactor') {
    const old = s.mech.equipment.findIndex((e) => EQUIPMENT[e].kind === 'reactor');
    if (old >= 0) s.inventory.push(...s.mech.equipment.splice(old, 1));
  }
  s.inventory.splice(s.inventory.indexOf(id), 1);
  s.mech.equipment.push(id);
  normalizeMech(s);
  return true;
}

export function removeEquipment(s: CareerState, index: number): void {
  const id = s.mech.equipment[index];
  if (!id) return;
  s.mech.equipment.splice(index, 1);
  s.inventory.push(id);
  normalizeMech(s);
}

/** Put an owned weapon in a hardpoint (whatever was there goes back to inventory). */
export function install(s: CareerState, mountId: string, weaponId: string): boolean {
  const mount = CHASSIS[s.mech.chassis].mounts.find((m) => m.id === mountId);
  const idx = s.inventory.indexOf(weaponId);
  if (!mount || idx < 0 || WEAPONS[weaponId].family !== mount.type) return false;
  uninstall(s, mountId);
  s.inventory.splice(idx, 1);
  // New weapons default to group 1 for ballistics, 2 for energy (matches the starter mech).
  s.mech.weapons.push({ mount: mountId, weapon: weaponId, group: mount.type === 'energy' ? 2 : 1 });
  return true;
}

export function uninstall(s: CareerState, mountId: string): void {
  const i = s.mech.weapons.findIndex((w) => w.mount === mountId);
  if (i < 0) return;
  s.inventory.push(s.mech.weapons[i].weapon);
  s.mech.weapons.splice(i, 1);
}

export function setGroup(s: CareerState, mountId: string, group: 1 | 2): void {
  const w = s.mech.weapons.find((x) => x.mount === mountId);
  if (w) w.group = group;
}

// ---------- Loans ----------

export function loanTerms(s: CareerState, amount: number): { total: number; installment: number; installments: number } {
  const total = Math.round(amount * (1 + ECONOMY.loan.interest * econ(s).interest));
  const n = ECONOMY.loan.installments;
  return { total, installment: Math.ceil(total / n), installments: n };
}

export function takeLoan(s: CareerState, amount: number): boolean {
  if (s.loan || !ECONOMY.loan.amounts.includes(amount)) return false;
  const t = loanTerms(s, amount);
  s.loan = { principal: amount, remaining: t.total, installment: t.installment, paymentsLeft: t.installments };
  s.money += amount;
  s.over = false;
  s.overReason = undefined;
  return true;
}

// ---------- Contracts ----------

export function refreshContracts(s: CareerState): void {
  s.contracts = [];
  for (let i = 0; i < ECONOMY.contractsOnBoard; i++) s.contracts.push(makeContract(s));
  s.contracts.sort((a, b) => a.tier - b.tier || a.payout - b.payout);
}

function makeContract(s: CareerState): Contract {
  const tier = pickTier();
  const t = ECONOMY.tiers[tier];
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
  const employer = pick(EMPLOYERS);
  const enemy = pick(ENEMY_FORCES);
  const payout = Math.round((t.payout[0] + Math.random() * (t.payout[1] - t.payout[0])) * econ(s).payouts / 500) * 500;
  return {
    id: s.nextContractId++,
    seed: randomSeed(),
    tier,
    employer,
    enemy,
    flavor: pick(CONTRACT_FLAVOR).replace('{employer}', employer).replace('{enemy}', enemy),
    targets: t.targets,
    payout,
    bonus: makeBonus(t.targets),
  };
}

function pickTier(): 1 | 2 | 3 {
  let r = Math.random();
  for (const tier of [1, 2, 3] as const) {
    r -= ECONOMY.tierWeights[tier];
    if (r <= 0) return tier;
  }
  return 1;
}

function makeBonus(targets: number): BonusObjective {
  const kinds: BonusObjective['kind'][] = ['turrets', 'tanks', 'fast', 'intact'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  switch (kind) {
    case 'turrets':
      return { kind, label: 'Destroy every turret' };
    case 'tanks':
      return { kind, label: 'Destroy every tank' };
    case 'fast': {
      const seconds = 150 + targets * 60;
      return { kind, label: `Finish within ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, seconds };
    }
    case 'intact':
      return { kind, label: 'Finish without losing a section' };
  }
}

export function bonusPayout(c: Contract): number {
  return Math.round((c.payout * ECONOMY.bonusFraction) / 500) * 500;
}

// ---------- Deploying ----------

export function fuelCost(s: CareerState): number {
  return price(s, tonnage(s.mech) * ECONOMY.fuelPerTon);
}

export type AmmoTarget = { ballistic: number; missile: number };

/** Price of topping ammo up to `target` (leftover ammo is already paid for). */
export function ammoCost(s: CareerState, target: AmmoTarget): number {
  const b = Math.max(0, target.ballistic - s.mech.ammo.ballistic);
  const m = Math.max(0, target.missile - (s.mech.ammo.missile ?? 0));
  return price(s, b * ECONOMY.ammoPrice.ballistic + m * ECONOMY.ammoPrice.missile);
}

/** Why the mech can't deploy right now, or null if it can. */
export function deployBlocker(s: CareerState, target: AmmoTarget): string | null {
  if (s.mech.destroyed) return 'Your mech is destroyed. Rebuild it first.';
  if (s.mech.sections.torso <= 0) return 'Torso destroyed. Repair it first.';
  const check = checkLoadout(s.mech);
  if (!check.ok) return check.problems.join('. ');
  if (fuelCost(s) + ammoCost(s, target) > s.money) return 'Not enough money for fuel and ammo.';
  return null;
}

export function deploy(s: CareerState, contractId: number, target: AmmoTarget): MissionConfig | null {
  const contract = s.contracts.find((c) => c.id === contractId);
  if (!contract || deployBlocker(s, target)) return null;
  spend(s, fuelCost(s) + ammoCost(s, target));
  const cap = ammoCapacity(s.mech);
  s.mech.ammo.ballistic = Math.max(s.mech.ammo.ballistic, Math.min(target.ballistic, cap.ballistic));
  s.mech.ammo.missile = Math.max(s.mech.ammo.missile ?? 0, Math.min(target.missile, cap.missile));
  s.activeContract = contract.id;
  const combat = COMBAT_DIFFICULTY[s.difficulty.combat];
  return {
    contract,
    mech: JSON.parse(JSON.stringify(s.mech)) as MechState,
    enemyCount: combat.enemyCount * ECONOMY.tiers[contract.tier].enemyCount,
    enemySpread: combat.enemySpread,
    enemyDamage: combat.enemyDamage,
  };
}

// ---------- After the mission ----------

export function completeMission(s: CareerState, contract: Contract, outcome: MissionOutcome): Debrief {
  const lines: DebriefLine[] = [];
  const notes: string[] = [];
  const before = s.money;
  s.activeContract = null;
  s.stats.missions++;
  s.mech = outcome.mech;

  if (outcome.won) {
    s.stats.wins++;
    lines.push({ label: 'Contract payment', amount: contract.payout });
    earn(s, contract.payout);
    if (outcome.bonusAchieved) {
      const b = bonusPayout(contract);
      lines.push({ label: `Bonus: ${contract.bonus.label}`, amount: b });
      earn(s, b);
    }
  } else {
    lines.push({ label: outcome.withdrew ? 'Withdrew: no payment' : 'Mission failed: no payment', amount: 0 });
  }
  if (s.mech.destroyed) notes.push('Your mech was destroyed. Rebuild it in the Mech tab before your next deployment.');

  // Loan installment comes due after every mission.
  if (s.loan) {
    const due = Math.min(s.loan.installment, s.loan.remaining);
    if (s.money < due) autoSell(s, due, notes);
    if (s.money >= due) {
      s.money -= due;
      s.loan.remaining -= due;
      s.loan.paymentsLeft--;
      lines.push({ label: 'Loan installment', amount: -due });
      if (s.loan.remaining <= 0 || s.loan.paymentsLeft <= 0) {
        s.loan = null;
        notes.push('Loan paid off.');
      }
    } else {
      lines.push({ label: 'Loan installment (missed)', amount: 0 });
      bankrupt(s, 'You missed a loan payment and had nothing left to sell.');
    }
  }

  refreshContracts(s);
  if (!s.over) checkCareerOver(s);
  return { outcome, contract, lines, net: s.money - before, moneyAfter: s.money, notes };
}

/** Sell spare gear (cheapest first) until `needed` is covered. */
function autoSell(s: CareerState, needed: number, notes: string[]): void {
  const order = s.inventory.map((id, i) => ({ id, i, v: sellPrice(s, id) })).sort((a, b) => a.v - b.v);
  const sold: string[] = [];
  for (const item of order) {
    if (s.money >= needed) break;
    s.money += item.v;
    sold.push(itemName(item.id));
    s.inventory[item.i] = '';
  }
  s.inventory = s.inventory.filter((x) => x !== '');
  if (sold.length > 0) notes.push(`Sold to cover the loan: ${sold.join(', ')}.`);
}

/** Money you could raise by selling spare gear. */
export function sellableValue(s: CareerState): number {
  return s.inventory.reduce((t, id) => t + sellPrice(s, id), 0);
}

/**
 * The career ends when you can't get back into the field: the mech is
 * destroyed or you can't afford fuel, you can't cover it by selling gear,
 * and you already have a loan.
 */
export function checkCareerOver(s: CareerState): void {
  if (s.over) return;
  const funds = s.money + sellableValue(s);
  const need = s.mech.destroyed ? rebuildCost(s) : fuelCost(s);
  if (funds >= need || !s.loan) return;
  bankrupt(
    s,
    s.mech.destroyed
      ? "Your last mech was destroyed, you can't afford to rebuild it, and you already owe a loan."
      : "You can't afford to deploy, have nothing left to sell, and already owe a loan.",
  );
}

/** Career over, or on easy economy an emergency bailout. */
function bankrupt(s: CareerState, reason: string): void {
  if (econ(s).bankruptcyEndsCareer) {
    s.over = true;
    s.overReason = reason;
    return;
  }
  s.loan = null;
  s.money = Math.max(s.money, 0);
  s.mech.destroyed = false;
  s.mech.sections = { ...mechStats(s.mech).sections };
  s.overReason = `Emergency bailout: ${reason} Your debt was cleared and your mech restored.`;
}

function spend(s: CareerState, amount: number): void {
  s.money -= amount;
  s.stats.spent += amount;
}

function earn(s: CareerState, amount: number): void {
  s.money += amount;
  s.stats.earned += amount;
}
