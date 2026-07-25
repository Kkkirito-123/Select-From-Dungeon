import type { Monster, ProfileProgress } from "./types";

export interface MonsterIdentityPresentation {
  discovered: boolean;
  idLabel: string;
  nameLabel: string;
  worldLabel: string;
  speciesLabel: string;
}

export function monsterIdLabel(id: number): string {
  return `ID #${String(id).padStart(3, "0")}`;
}

export function isMonsterIdentityDiscovered(
  monsterId: number,
  discoveredMonsterIds: readonly number[],
): boolean {
  return discoveredMonsterIds.includes(monsterId);
}

export function monsterIdentityPresentation(
  monster: Pick<Monster, "id" | "name" | "species">,
  discoveredMonsterIds: readonly number[],
): MonsterIdentityPresentation {
  const idLabel = monsterIdLabel(monster.id);
  const discovered = isMonsterIdentityDiscovered(
    monster.id,
    discoveredMonsterIds,
  );
  return {
    discovered,
    idLabel,
    nameLabel: discovered ? monster.name : idLabel,
    worldLabel: discovered ? `${monster.name} · ${idLabel}` : idLabel,
    speciesLabel: discovered ? `species = '${monster.species}'` : "species = 未识别",
  };
}

export function monsterNameForProfile(
  monster: Pick<Monster, "id" | "name">,
  profile: Pick<ProfileProgress, "discoveredMonsterIds">,
): string {
  return isMonsterIdentityDiscovered(
    monster.id,
    profile.discoveredMonsterIds,
  )
    ? monster.name
    : monsterIdLabel(monster.id);
}

export function recoverMonsterIdentity(
  profile: ProfileProgress,
  monsterId: number,
): boolean {
  if (profile.discoveredMonsterIds.includes(monsterId)) return false;
  profile.discoveredMonsterIds = [...profile.discoveredMonsterIds, monsterId]
    .sort((left, right) => left - right);
  return true;
}
