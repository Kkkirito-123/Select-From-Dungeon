/**
 * 故事证据数据库的独立 Schema 和种子数据。
 * 这些表只服务于剧情查询，不应混入普通战斗 Schema 或永久存档。
 */
export interface IdentitySourceFixture {
  /** 一条可供剧情查询使用的身份来源记录。 */
  id: number;
  residentId: number;
  contentKey: string;
  aliasName: string;
  sourceKind: string;
  sector: string;
  restoreTrace: string;
  recordStatus: "recovered" | "sealed";
}

export const WORLD_STORY_SCHEMA_DDL = `
  CREATE TABLE residents (
    id INTEGER PRIMARY KEY,
    name TEXT,
    restore_trace TEXT NOT NULL,
    status TEXT NOT NULL,
    room_id INTEGER,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE identity_sources (
    id INTEGER PRIMARY KEY,
    resident_id INTEGER,
    content_key TEXT NOT NULL UNIQUE,
    alias_name TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    sector TEXT NOT NULL,
    restore_trace TEXT NOT NULL,
    record_status TEXT NOT NULL,
    FOREIGN KEY (resident_id) REFERENCES residents(id)
  );

  CREATE INDEX idx_residents_restore_trace
    ON residents(restore_trace);
  CREATE INDEX idx_identity_sources_trace_sector
    ON identity_sources(restore_trace, sector);
`;

export const IDENTITY_SOURCE_FIXTURES: readonly IdentitySourceFixture[] = [
  {
    id: 1,
    residentId: 101,
    contentKey: "OLD_NAME_DOCK",
    aliasName: "澜",
    sourceKind: "cargo-ledger",
    sector: "coast",
    restoreTrace: "TRACE-7F",
    recordStatus: "recovered",
  },
  {
    id: 2,
    residentId: 102,
    contentKey: "OLD_NAME_SHOAL",
    aliasName: "苇",
    sourceKind: "beacon-mark",
    sector: "coast",
    restoreTrace: "TRACE-7F",
    recordStatus: "recovered",
  },
  {
    id: 3,
    residentId: 103,
    contentKey: "OLD_NAME_BRIDGE",
    aliasName: "铃",
    sourceKind: "bridge-carving",
    sector: "forest",
    restoreTrace: "TRACE-7F",
    recordStatus: "recovered",
  },
  {
    id: 4,
    residentId: 104,
    contentKey: "OLD_NAME_MARSH",
    aliasName: "禾",
    sourceKind: "medicine-book",
    sector: "swamp",
    restoreTrace: "TRACE-7F",
    recordStatus: "recovered",
  },
  {
    id: 5,
    residentId: 105,
    contentKey: "OLD_NAME_VILLAGE",
    aliasName: "舟",
    sourceKind: "doorplate",
    sector: "lake",
    restoreTrace: "TRACE-7F",
    recordStatus: "recovered",
  },
  {
    id: 6,
    residentId: 106,
    contentKey: "OLD_NAME_WRECK",
    aliasName: "鸥",
    sourceKind: "cabin-list",
    sector: "lake",
    restoreTrace: "TRACE-7F",
    recordStatus: "recovered",
  },
  {
    id: 7,
    residentId: 107,
    contentKey: "OLD_NAME_LIGHTHOUSE",
    aliasName: "渡",
    sourceKind: "lighthouse-watch",
    sector: "lighthouse",
    restoreTrace: "TRACE-7F",
    recordStatus: "sealed",
  },
] as const;

function quote(value: string): string {
  // 仅处理内置种子文本；统一转义单引号，避免生成非法 SQL。
  return `'${value.replaceAll("'", "''")}'`;
}

export function worldStorySeedDml(): string {
  // 生成确定性的故事证据插入语句。
  const residents = IDENTITY_SOURCE_FIXTURES.map((entry) => (
    `(${entry.residentId}, ${quote(entry.aliasName)}, ${quote(entry.restoreTrace)}, ` +
    `${quote("archived")}, NULL)`
  )).join(",\n    ");
  const sources = IDENTITY_SOURCE_FIXTURES.map((entry) => (
    `(${entry.id}, ${entry.residentId}, ${quote(entry.contentKey)}, ` +
    `${quote(entry.aliasName)}, ${quote(entry.sourceKind)}, ${quote(entry.sector)}, ` +
    `${quote(entry.restoreTrace)}, ${quote(entry.recordStatus)})`
  )).join(",\n    ");
  return `
    INSERT INTO residents(id, name, restore_trace, status, room_id) VALUES
      ${residents};

    INSERT INTO identity_sources(
      id, resident_id, content_key, alias_name, source_kind, sector,
      restore_trace, record_status
    ) VALUES
      ${sources};
  `;
}
