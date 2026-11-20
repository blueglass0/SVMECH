import { CHASSIS, CHASSIS_ORDER, type Section } from '../data/chassis';
import { COMBAT_DIFFICULTY } from '../data/difficulty';
import { CONTRACT_FLAVOR, ECONOMY, ECONOMY_DIFFICULTY, EMPLOYERS, ENEMY_FORCES, SHOP_STOCK } from '../data/economy';
import { STARTER_LOADOUT } from '../data/loadouts';
import { DESTROY_TARGETS } from '../data/missions';
import { ENEMIES } from '../data/enemies';
import { WEAPONS } from '../data/weapons';
import { EQUIPMENT } from '../data/equipment';
import { itemName, itemPrice, isEquipment } from '../data/items';
import { fitsMount, mechStats } from '../game/mechStats';
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
 * Career rules: money, hangar, upkeep, contracts, shop, loadout limits, loans
 * and career over. Pure logic on a `CareerState`; the UI calls these and saves.
 */

const SAVE_KEY = 'steel-vulture.career.v1';

// ---------- Persistence ----------

/** Things changed while loading an old save, for the hangar to mention once. */
export const loadNotes: string[] = [];

export function loadCareer(): CareerState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as CareerState & { mech?: MechState };
    if (s.version !== 1) return null;
    // Saves from before the hangar (M7) had a single `mech`.
    if (s.mech && !s.mechs) {
      s.mechs = [{ ...s.mech, id: 1 }];
      s.activeMechId = 1;
      s.backupIds = [];
      s.nextMechId = 2;
      delete s.mech;
    }
    for (const m of s.mechs) {
      // Saves from before equipment existed (M5): give the mech the starter reactor and heat sink.
      if (!m.equipment) m.equipment = [...STARTER_LOADOUT.equipment];
      // Sized mounts (after M8): weapons that no longer fit their mount go to storage.
      const mounts = CHASSIS[m.chassis].mounts;
      for (const w of [...m.weapons]) {
        const mount = mounts.find((x) => x.id === w.mount);
        if (mount && WEAPONS[w.weapon] && fitsMount(WEAPONS[w.weapon], mount)) continue;
        m.weapons.splice(m.weapons.indexOf(w), 1);
        if (WEAPONS[w.weapon]) s.inventory.push(w.weapon);
        loadNotes.push(`${WEAPONS[w.weapon]?.name ?? w.weapon} didn't fit the new ${CHASSIS[m.chassis].name} mounts and was moved to storage.`);
      }
      normalizeMech(m);
    }
    // Boards from before enemy mechs and drones (M8) get fresh contracts that include them.
    if (s.activeContract === null && s.contracts.length && s.contracts.every((k) => k.enemyMechs === undefined)) refreshContracts(s);
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
  const s: CareerState = {
    version: 1,
    money: ECONOMY.startingMoney,
    loan: null,
    mechs: [],
    activeMechId: 1,
    backupIds: [],
    nextMechId: 1,
    inventory: [],
    contracts: [],
    difficulty: { combat, economy },
    stats: { missions: 0, wins: 0, earned: 0, spent: 0 },
    nextContractId: 1,
    activeContract: null,
    over: false,
  };
  s.activeMechId = addMech(s, STARTER_LOADOUT.chassis).id;
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

// ---------- Hangar ----------

/** A new mech of a chassis with its stock loadout, full armor and ammo. */
function addMech(s: CareerState, chassisId: string): MechState {
  const c = CHASSIS[chassisId];
  const m: MechState = {
    id: s.nextMechId++,
    chassis: c.id,
    weapons: c.stock.weapons.map((w) => ({ ...w })),
    equipment: [...c.stock.equipment],
    sections: { ...c.sections },
    ammo: { ...c.ammoCapacity },
    destroyed: false,
  };
  const st = mechStats(m);
  m.sections = { ...st.sections };
  m.ammo = { ...st.ammoCapacity };
  s.mechs.push(m);
  return m;
}

export function getMech(s: CareerState, id: number): MechState | undefined {
  return s.mechs.find((m) => m.id === id);
}

export function activeMech(s: CareerState): MechState {
  return getMech(s, s.activeMechId) ?? s.mechs[0];
}

/** Display name: chassis name plus a number when you own several of the same chassis. */
export function mechName(s: CareerState, m: MechState): string {
  const same = s.mechs.filter((x) => x.chassis === m.chassis);
  const name = CHASSIS[m.chassis].name;
  return same.length > 1 ? `${name} ${same.indexOf(m) + 1}` : name;
}

/** Backups that can actually deploy, in drop order. */
export function backups(s: CareerState): MechState[] {
  return s.backupIds
    .map((id) => getMech(s, id))
    .filter((m): m is MechState => !!m && m.id !== s.activeMechId)
    .slice(0, ECONOMY.maxBackups);
}

export function setActive(s: CareerState, id: number): void {
  if (!getMech(s, id)) return;
  s.activeMechId = id;
  s.backupIds = s.backupIds.filter((b) => b !== id);
}

/** Add or remove a mech from the backups. When full, the newest choice replaces the oldest. */
export function toggleBackup(s: CareerState, id: number): void {
  if (id === s.activeMechId || !getMech(s, id)) return;
  if (s.backupIds.includes(id)) {
    s.backupIds = s.backupIds.filter((b) => b !== id);
    return;
  }
  s.backupIds.push(id);
  while (s.backupIds.length > ECONOMY.maxBackups) s.backupIds.shift();
}

export function chassisPrice(s: CareerState, chassisId: string): number {
  return price(s, CHASSIS[chassisId].price);
}

export function buyChassis(s: CareerState, chassisId: string): MechState | null {
  if (!CHASSIS_ORDER.includes(chassisId)) return null;
  const cost = chassisPrice(s, chassisId);
  if (cost > s.money) return null;
  spend(s, cost);
  return addMech(s, chassisId);
}

/** What selling a mech pays: a share of its value, less for damage (or destroyed). */
export function mechSellValue(s: CareerState, m: MechState): number {
  const value = price(s, mechValue(m)) * ECONOMY.sellFraction;
  if (m.destroyed) return Math.round(value * 0.25);
  return Math.max(0, Math.round(value - totalRepairCost(s, m)));
}

/** Sell a mech (never the last one). Its weapons and equipment go with it. */
export function sellMech(s: CareerState, id: number): boolean {
  const m = getMech(s, id);
  if (!m || s.mechs.length <= 1) return false;
  earn(s, mechSellValue(s, m));
  s.mechs = s.mechs.filter((x) => x.id !== id);
  s.backupIds = s.backupIds.filter((b) => b !== id);
  if (s.activeMechId === id) s.activeMechId = s.mechs[0].id;
  return true;
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
  if (st.reactors.length > 1) problems.push('Only one reactor allowed');
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
export function normalizeMech(m: MechState): void {
  const st = mechStats(m);
  for (const sec of SECTIONS) m.sections[sec] = Math.min(m.sections[sec], st.sections[sec]);
  m.ammo.ballistic = Math.min(m.ammo.ballistic, st.ammoCapacity.ballistic);
  m.ammo.missile = Math.min(m.ammo.missile ?? 0, st.ammoCapacity.missile);
}

export function sectionRepairCost(s: CareerState, m: MechState, section: Section): number {
  const max = mechStats(m).sections[section];
  const missing = max - m.sections[section];
  if (missing <= 0) return 0;
  const mult = m.sections[section] <= 0 ? ECONOMY.destroyedSectionMultiplier : 1;
  return price(s, missing * ECONOMY.repairPerArmor * mult);
}

export function totalRepairCost(s: CareerState, m: MechState): number {
  return SECTIONS.reduce((t, sec) => t + sectionRepairCost(s, m, sec), 0);
}

export function repairSection(s: CareerState, m: MechState, section: Section): boolean {
  const cost = sectionRepairCost(s, m, section);
  if (cost === 0 || cost > s.money || m.destroyed) return false;
  spend(s, cost);
  m.sections[section] = mechStats(m).sections[section];
  return true;
}

export function repairAll(s: CareerState, m: MechState): boolean {
  const cost = totalRepairCost(s, m);
  if (cost === 0 || cost > s.money || m.destroyed) return false;
  for (const sec of SECTIONS) repairSection(s, m, sec);
  return true;
}

export function rebuildCost(s: CareerState, m: MechState): number {
  return price(s, mechValue(m) * ECONOMY.rebuildFraction);
}

export function rebuild(s: CareerState, m: MechState): boolean {
  const cost = rebuildCost(s, m);
  if (!m.destroyed || cost > s.money) return false;
  spend(s, cost);
  m.destroyed = false;
  m.sections = { ...mechStats(m).sections };
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

/** Fit an owned reactor ('' = none; the frame's own power still runs the mech). The old one goes to inventory. */
export function setReactor(s: CareerState, m: MechState, id: string): boolean {
  if (id && (s.inventory.indexOf(id) < 0 || EQUIPMENT[id]?.kind !== 'reactor')) return false;
  const old = m.equipment.findIndex((e) => EQUIPMENT[e].kind === 'reactor');
  if (old >= 0) s.inventory.push(...m.equipment.splice(old, 1));
  if (id) {
    s.inventory.splice(s.inventory.indexOf(id), 1);
    m.equipment.unshift(id);
  }
  normalizeMech(m);
  return true;
}

/** The fitted reactor's id, or '' for none. */
export function reactorOf(m: MechState): string {
  return m.equipment.find((e) => EQUIPMENT[e].kind === 'reactor') ?? '';
}

/** Install owned equipment. A new reactor replaces the old one (which goes to inventory). */
export function installEquipment(s: CareerState, m: MechState, id: string): boolean {
  const idx = s.inventory.indexOf(id);
  if (idx < 0 || !isEquipment(id)) return false;
  if (EQUIPMENT[id].kind === 'reactor') {
    const old = m.equipment.findIndex((e) => EQUIPMENT[e].kind === 'reactor');
    if (old >= 0) s.inventory.push(...m.equipment.splice(old, 1));
  }
  s.inventory.splice(s.inventory.indexOf(id), 1);
  m.equipment.push(id);
  normalizeMech(m);
  return true;
}

export function removeEquipment(s: CareerState, m: MechState, index: number): void {
  const id = m.equipment[index];
  if (!id) return;
  m.equipment.splice(index, 1);
  s.inventory.push(id);
  normalizeMech(m);
}

/** Put an owned weapon in a hardpoint (whatever was there goes back to inventory). */
export function install(s: CareerState, m: MechState, mountId: string, weaponId: string): boolean {
  const mount = CHASSIS[m.chassis].mounts.find((x) => x.id === mountId);
  const idx = s.inventory.indexOf(weaponId);
  if (!mount || idx < 0 || !WEAPONS[weaponId] || !fitsMount(WEAPONS[weaponId], mount)) return false;
  uninstall(s, m, mountId);
  s.inventory.splice(s.inventory.indexOf(weaponId), 1);
  // New weapons default to group 1 for ballistics, 2 for energy and missiles.
  m.weapons.push({ mount: mountId, weapon: weaponId, group: WEAPONS[weaponId].family === 'ballistic' ? 1 : 2 });
  return true;
}

export function uninstall(s: CareerState, m: MechState, mountId: string): void {
  const i = m.weapons.findIndex((w) => w.mount === mountId);
  if (i < 0) return;
  s.inventory.push(m.weapons[i].weapon);
  m.weapons.splice(i, 1);
}

export function setGroup(m: MechState, mountId: string, group: 1 | 2): void {
  const w = m.weapons.find((x) => x.mount === mountId);
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
  const limited = Math.random() < ECONOMY.tonnageLimitChance;
  const maxTonnage = limited ? pick(ECONOMY.tonnageLimits) : undefined;
  const base = (t.payout[0] + Math.random() * (t.payout[1] - t.payout[0])) * econ(s).payouts;
  const forces = rollForces(tier);
  const bonus = (limited ? ECONOMY.tonnageLimitPayBonus : 0) + forces.enemyMechs.length * ECONOMY.enemyMechPayBonus;
  const payout = Math.round((base * (1 + bonus)) / 500) * 500;
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
    maxTonnage,
    ...forces,
  };
}

/** Enemy mechs and drone flights for a contract of this tier (data/missions.ts). */
function rollForces(tier: 1 | 2 | 3): { enemyMechs: string[]; droneFlights: number } {
  const f = DESTROY_TARGETS.forces[tier];
  const int = (r: [number, number]) => r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1));
  const enemyMechs: string[] = [];
  for (let n = int(f.mechs); n > 0; n--) {
    let r = Math.random() * f.mechTypes.reduce((t, m) => t + m.weight, 0);
    const pick = f.mechTypes.find((m) => (r -= m.weight) <= 0) ?? f.mechTypes[0];
    enemyMechs.push(pick.type);
  }
  return { enemyMechs, droneFlights: int(f.droneFlights) };
}

/** Short description of a contract's enemy mechs and drones for the board ('' if none). */
export function forcesLabel(k: Contract): string {
  const parts: string[] = [];
  const mechs = k.enemyMechs ?? [];
  if (mechs.length) parts.push(mechs.map((id) => ENEMIES[id]?.name ?? id).join(', '));
  if (k.droneFlights) parts.push(`${k.droneFlights} drone flight${k.droneFlights > 1 ? 's' : ''}`);
  return parts.join(' · ');
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

export function fuelCost(s: CareerState, m: MechState): number {
  return price(s, tonnage(m) * ECONOMY.fuelPerTon);
}

export type AmmoTarget = { ballistic: number; missile: number };

/** Price of topping a mech's ammo up to `target` (leftover ammo is already paid for). */
export function ammoCost(s: CareerState, m: MechState, target: AmmoTarget): number {
  const b = Math.max(0, target.ballistic - m.ammo.ballistic);
  const mi = Math.max(0, target.missile - (m.ammo.missile ?? 0));
  return price(s, b * ECONOMY.ammoPrice.ballistic + mi * ECONOMY.ammoPrice.missile);
}

/** Fuel and ammo for the deployment: the active mech topped up to `target`, backups filled. */
export function deployCost(s: CareerState, target: AmmoTarget): { fuel: number; ammo: number; backupFuel: number; backupAmmo: number } {
  const a = activeMech(s);
  const bs = backups(s);
  return {
    fuel: fuelCost(s, a),
    ammo: ammoCost(s, a, target),
    backupFuel: bs.reduce((t, m) => t + Math.round(fuelCost(s, m) * ECONOMY.backupFuelFraction), 0),
    backupAmmo: bs.reduce((t, m) => t + ammoCost(s, m, ammoCapacity(m)), 0),
  };
}

/** Why a mech can't go on this contract, or null. */
export function mechBlocker(m: MechState, contract: Contract | null, label: string): string | null {
  if (m.destroyed) return `${label} is destroyed. Rebuild it first.`;
  if (m.sections.torso <= 0) return `${label}'s torso is destroyed. Repair it first.`;
  const check = checkLoadout(m);
  if (!check.ok) return `${label}: ${check.problems.join('. ')}`;
  if (contract?.maxTonnage && tonnage(m) > contract.maxTonnage) {
    return `${label} weighs ${tonnage(m)} t; this contract allows ${contract.maxTonnage} t.`;
  }
  return null;
}

/** Why the deployment can't go ahead, or null if it can. */
export function deployBlocker(s: CareerState, contract: Contract, target: AmmoTarget): string | null {
  const a = activeMech(s);
  const own = mechBlocker(a, contract, mechName(s, a));
  if (own) return own;
  for (const b of backups(s)) {
    const bb = mechBlocker(b, contract, `Backup ${mechName(s, b)}`);
    if (bb) return bb;
  }
  const c = deployCost(s, target);
  if (c.fuel + c.ammo + c.backupFuel + c.backupAmmo > s.money) return 'Not enough money for fuel and ammo.';
  return null;
}

export function deploy(s: CareerState, contractId: number, target: AmmoTarget): MissionConfig | null {
  const contract = s.contracts.find((c) => c.id === contractId);
  if (!contract || deployBlocker(s, contract, target)) return null;
  const cost = deployCost(s, target);
  spend(s, cost.fuel + cost.ammo + cost.backupFuel + cost.backupAmmo);
  const a = activeMech(s);
  const cap = ammoCapacity(a);
  a.ammo.ballistic = Math.max(a.ammo.ballistic, Math.min(target.ballistic, cap.ballistic));
  a.ammo.missile = Math.max(a.ammo.missile ?? 0, Math.min(target.missile, cap.missile));
  const bs = backups(s);
  for (const b of bs) b.ammo = { ...ammoCapacity(b) };
  s.activeContract = contract.id;
  const combat = COMBAT_DIFFICULTY[s.difficulty.combat];
  const copy = (m: MechState) => JSON.parse(JSON.stringify(m)) as MechState;
  const repairMk = ECONOMY.field.repairMarkup * econ(s).costs;
  const ammoMk = ECONOMY.field.ammoMarkup * econ(s).costs;
  return {
    contract,
    mech: copy(a),
    backups: bs.map(copy),
    funds: s.money,
    fieldPrices: {
      repairPerArmor: ECONOMY.repairPerArmor * repairMk,
      ammoBallistic: ECONOMY.ammoPrice.ballistic * ammoMk,
      ammoMissile: ECONOMY.ammoPrice.missile * ammoMk,
      swapFee: price(s, ECONOMY.field.swapFee),
    },
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
  for (const m of outcome.mechs) {
    const i = s.mechs.findIndex((x) => x.id === m.id);
    if (i >= 0) s.mechs[i] = m;
  }

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
  for (const f of outcome.fieldCosts ?? []) {
    spend(s, f.amount);
    lines.push({ label: f.label, amount: -f.amount });
  }
  const lost = outcome.mechs.filter((m) => m.destroyed);
  if (lost.length > 0) {
    notes.push(`Destroyed: ${lost.map((m) => mechName(s, m)).join(', ')}. Rebuild in the Mech tab, or field another mech.`);
  }

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

/** Money you could raise by selling spare gear and every mech you aren't fielding. */
export function sellableValue(s: CareerState): number {
  const spareMechs = s.mechs.filter((m) => m.id !== s.activeMechId).reduce((t, m) => t + mechSellValue(s, m), 0);
  return s.inventory.reduce((t, id) => t + sellPrice(s, id), 0) + spareMechs;
}

/**
 * The career ends when you can't get back into the field: no mech can deploy
 * and you can't afford to rebuild one (or fuel one), even after selling spare
 * gear and mechs, and you already have a loan.
 */
export function checkCareerOver(s: CareerState): void {
  if (s.over) return;
  const ready = s.mechs.filter((m) => !m.destroyed);
  const need = ready.length > 0 ? Math.min(...ready.map((m) => fuelCost(s, m))) : Math.min(...s.mechs.map((m) => rebuildCost(s, m)));
  if (s.money + sellableValue(s) >= need || !s.loan) return;
  bankrupt(
    s,
    ready.length === 0
      ? "Your mechs are destroyed, you can't afford to rebuild one, and you already owe a loan."
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
  const a = activeMech(s);
  a.destroyed = false;
  a.sections = { ...mechStats(a).sections };
  s.overReason = `Emergency bailout: ${reason} Your debt was cleared and your active mech restored.`;
}

function spend(s: CareerState, amount: number): void {
  s.money -= amount;
  s.stats.spent += amount;
}

function earn(s: CareerState, amount: number): void {
  s.money += amount;
  s.stats.earned += amount;
}
