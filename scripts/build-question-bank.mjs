import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import initSqlJs from "sql.js";
import { createServer } from "vite";

function uniqueStages(entries) {
  return [...new Map(entries.map((entry) => [entry.stage.id, entry])).values()];
}

function questionFamilies(candidates, count, tier, scope, offset = 0, excludedStageIds = new Set()) {
  const parameterized = candidates.filter((entry) => (
    /'(?:''|[^'])*'|-?\d+(?:\.\d+)?/u.test(entry.stage.answerSql)
  ));
  if (parameterized.length === 0) throw new Error(`${tier}/${scope} 题组没有可参数化阶段。`);
  const rotated = [
    ...parameterized.slice(offset % parameterized.length),
    ...parameterized.slice(0, offset % parameterized.length),
  ];
  const ordered = [
    ...rotated.filter((entry) => !excludedStageIds.has(entry.stage.id)),
    ...rotated.filter((entry) => excludedStageIds.has(entry.stage.id)),
  ];
  return Array.from({ length: count }, (_, familyIndex) => ({
    tier,
    scope,
    entry: ordered[familyIndex % ordered.length],
  }));
}

function replaceAt(value, start, length, replacement) {
  return `${value.slice(0, start)}${replacement}${value.slice(start + length)}`;
}

function replaceLiteralInCopy(value, raw, replacement) {
  const plain = raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : raw;
  return value.includes(plain) ? value.replace(plain, replacement) : value;
}

function nearbyColumn(sql, index, domainColumns) {
  const prefix = sql.slice(Math.max(0, index - 120), index).toLowerCase();
  return domainColumns
    .map((column) => {
      const escaped = column.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const matcher = new RegExp(`(?:^|[^a-z0-9_])${escaped}(?![a-z0-9_])`, "giu");
      let match;
      let lastIndex = -1;
      while ((match = matcher.exec(prefix)) !== null) {
        lastIndex = match.index + match[0].length;
      }
      return { column, index: lastIndex };
    })
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => right.index - left.index)[0]?.column ?? null;
}

function tableSpecificValues(sql, column, domains) {
  const suffix = `.${column}`;
  const matches = [...domains.keys()].filter((key) => {
    if (!key.endsWith(suffix)) return false;
    const table = key.slice(0, -suffix.length);
    return new RegExp(`\\b${table}\\b`, "iu").test(sql);
  });
  return matches.length === 1 ? [...(domains.get(matches[0]) ?? [])] : [];
}

function literalOptions(stage, floor, domains, monstersByFloor, config) {
  const sql = stage.answerSql.trim().replace(/;$/u, "");
  const literals = [...sql.matchAll(/'(?:''|[^'])*'|-?\d+(?:\.\d+)?/gu)]
    .filter((match) => match.index !== undefined);
  if (literals.length === 0) {
    throw new Error(`${stage.id} 没有可参数化的 SQL 字面量。`);
  }
  const domainColumns = [...domains.keys()]
    .filter((column) => !column.includes(".") && !column.includes(":"))
    .sort((left, right) => right.length - left.length);
  const groups = literals.map((literal) => {
    const raw = literal[0];
    const column = nearbyColumn(sql, literal.index, domainColumns);
    let values = column
      ? tableSpecificValues(sql, column, domains)
      : [];
    if (values.length === 0 && column) values = [...(domains.get(column) ?? [])];
    const prefix = sql.slice(Math.max(0, literal.index - 32), literal.index).toLowerCase();
    if (/\blimit\s*$/u.test(prefix) || /\boffset\s*$/u.test(prefix)) {
      values = [1, 2, 3, 4, 5, 6, 7, 8];
    } else if (/\bcount\s*\([^)]*\)\s*(?:>=|>|=|<=|<)\s*$/u.test(prefix)) {
      values = [1, 2, 3, 4, 5];
    } else if (/\brepair_queue\b/iu.test(sql) && !raw.startsWith("'")) {
      values = [...new Set([...(domains.get("repair_id") ?? []), 6, 7, 8, 9])];
    } else if (column === "id" && /\bmonsters\b/iu.test(sql)) {
      values = monstersByFloor.get(floor) ?? [];
    } else if (column === "room_id" && /\bmonsters\b/iu.test(sql)) {
      values = [...new Set((monstersByFloor.get(floor) ?? []).map((id) => (
        domains.get(`monster_room:${id}`)?.[0]
      )).filter((value) => value !== undefined))];
    } else if (
      ["status", "weakness", "master_id"].includes(column ?? "") &&
      /\bmonsters\b/iu.test(sql)
    ) {
      values = [...new Set((monstersByFloor.get(floor) ?? []).flatMap((id) => (
        domains.get(`monster_${column}:${id}`) ?? []
      )))];
    }
    const isString = raw.startsWith("'");
    values = values.filter((value) => (
      isString ? typeof value === "string" : typeof value === "number"
    ));
    if (values.length === 0) {
      values = isString
        ? [...(domains.get("string_fallback") ?? [])]
        : [...(monstersByFloor.get(floor) ?? [])];
    }
    return [...new Set(values)].slice(0, config.generationDomainValueLimit).map((value) => {
      const display = String(value);
      const replacement = isString
        ? `'${display.replace(/'/g, "''")}'`
        : display;
      return {
        index: literal.index,
        raw,
        replacement,
        display,
        label: column ?? "条件",
      };
    });
  });
  const replacementSets = [
    ...groups.flatMap((group) => group.map((replacement) => [replacement])),
  ];
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      groups[left].slice(0, config.generationDomainValueLimit).forEach((leftReplacement) => {
        groups[right].slice(0, config.generationDomainValueLimit).forEach((rightReplacement) => {
          replacementSets.push([leftReplacement, rightReplacement]);
        });
      });
    }
  }
  const options = replacementSets.map((replacements) => {
    let answer = sql;
    [...replacements]
      .sort((left, right) => right.index - left.index)
      .forEach((entry) => {
        answer = replaceAt(answer, entry.index, entry.raw.length, entry.replacement);
      });
    const answerSql = `${answer};`;
    let objective = stage.objective;
    let hints = stage.hints.slice(0, -1);
    replacements.forEach((entry) => {
      objective = replaceLiteralInCopy(objective, entry.raw, entry.display);
      hints = hints.map((hint) => replaceLiteralInCopy(hint, entry.raw, entry.display));
    });
    objective = `${objective} 本题参数：${replacements.map((entry) => (
      `${entry.label}=${entry.display}`
    )).join("，")}。`;
    hints.push(`完整写法：${answerSql}`);
    return { objective, answerSql, hints };
  });
  if (/\bis\s+(?:not\s+)?null\b/iu.test(sql)) {
    [...options].forEach((option) => {
      const toNotNull = /\bis\s+null\b/iu.test(option.answerSql);
      const answerSql = toNotNull
        ? option.answerSql.replace(/\bis\s+null\b/giu, "IS NOT NULL")
        : option.answerSql.replace(/\bis\s+not\s+null\b/giu, "IS NULL");
      const rewriteCopy = (copy) => toNotNull
        ? copy.replace(/为空/gu, "不为空").replace(/\bis\s+null\b/giu, "IS NOT NULL")
        : copy.replace(/不为空/gu, "为空").replace(/\bis\s+not\s+null\b/giu, "IS NULL");
      options.push({
        objective: rewriteCopy(option.objective),
        answerSql,
        hints: [
          ...option.hints.slice(0, -1).map(rewriteCopy),
          `完整写法：${answerSql}`,
        ],
      });
    });
  }
  if (
    floor >= config.reviewStartsAtFloor &&
    /^\s*(?:SELECT|WITH)\b/iu.test(sql) &&
    !/\blimit\b/iu.test(sql)
  ) {
    const materialOptions = [...options];
    materialOptions.forEach((option) => {
      const baseSql = option.answerSql.trim().replace(/;$/u, "");
      for (let limit = 1; limit <= config.generationLimitMaximum; limit += 1) {
        const answerSql = `${baseSql} LIMIT ${limit};`;
        options.push({
          objective: `${option.objective} 最多返回 ${limit} 行。`,
          answerSql,
          hints: [
            ...option.hints.slice(0, -1),
            `最后使用 LIMIT ${limit}。`,
            `完整写法：${answerSql}`,
          ],
        });
      }
    });
  }
  return options;
}

function materialVariant(
  stage,
  floor,
  familyIndex,
  variantIndex,
  attempt,
  domains,
  monstersByFloor,
  config,
) {
  const options = literalOptions(stage, floor, domains, monstersByFloor, config);
  if (options.length === 0) throw new Error(`${stage.id} 没有真实值参数候选。`);
  return options[
    (familyIndex * config.variantsPerFamily + variantIndex - 1 + attempt) % options.length
  ];
}

function planEvidence(plan) {
  const normalized = plan.join(" ").toUpperCase();
  const include = [];
  if (normalized.includes("COVERING")) include.push("COVERING");
  else if (normalized.includes("SEARCH")) include.push("SEARCH");
  else if (normalized.includes("SCAN")) include.push("SCAN");
  if (normalized.includes("USE TEMP B-TREE")) include.push("USE TEMP B-TREE");
  return include;
}

function buildDomains(engine, monsters, floor) {
  const domains = new Map();
  const register = (column, values) => {
    domains.set(column, [...new Set([
      ...(domains.get(column) ?? []),
      ...values.filter((value) => value !== null),
    ])]);
  };
  const tableColumns = {
    monsters: ["id", "room_id", "status", "weakness", "master_id"],
    monster_signals: ["monster_id", "channel", "charge"],
    rooms: ["id", "floor", "sector"],
    monster_gear: ["monster_id", "power"],
    repair_queue: ["id", "item", "quantity", "status"],
    index_records: ["id", "realm", "category", "score", "code"],
    tx_versions: ["row_id", "version_id", "value", "created_tx", "expired_tx"],
    lock_waits: ["waiter_tx", "blocker_tx", "resource"],
    isolation_cases: ["id", "phenomenon", "first_count", "second_count", "prevented_by"],
    schema_choices: ["id", "model", "has_primary_key", "has_unique_email", "duplicate_groups", "score"],
    replica_status: ["node", "region", "lag_ms", "healthy", "role"],
    shard_routes: ["account_id", "shard_id", "region", "route_ok"],
    security_cases: ["id", "method", "parameterized", "least_privilege", "allowed"],
  };
  Object.entries(tableColumns).forEach(([table, columns]) => {
    columns.forEach((column) => {
      const result = engine.execute(
        `SELECT DISTINCT ${column} FROM ${table} WHERE ${column} IS NOT NULL ORDER BY ${column};`,
        floor,
      );
      const values = result.rows.map((row) => row[column]);
      register(column, values);
      register(`${table}.${column}`, values);
      if (table === "repair_queue" && column === "id") {
        register("repair_id", result.rows.map((row) => row[column]));
      }
    });
  });
  register("id", monsters.map((monster) => monster.id));
  register("room_id", monsters.map((monster) => monster.roomId));
  register("status", monsters.map((monster) => monster.status));
  register("weakness", monsters.map((monster) => monster.weakness));
  register("master_id", monsters.map((monster) => monster.masterId));
  monsters.forEach((monster) => {
    register(`monster_room:${monster.id}`, [monster.roomId]);
    register(`monster_status:${monster.id}`, [monster.status]);
    register(`monster_weakness:${monster.id}`, [monster.weakness]);
    register(`monster_master_id:${monster.id}`, [monster.masterId]);
  });
  register("string_fallback", [
    ...domains.values(),
  ].flat().filter((value) => typeof value === "string"));
  return domains;
}

function insertQuestion(database, question) {
  database.run(
    `INSERT INTO questions(
      question_id, bank_version, floor, scope, tier, template_id, variant_index,
      primary_lesson_id, base_stage_id, objective, answer_sql, hints_json,
      required_features_json, expectation_kind, expected_columns_json,
      expected_rows_json, rows_ordered, plan_include_json, plan_exclude_json,
      enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      question.questionId,
      question.bankVersion,
      question.floor,
      question.scope,
      question.tier,
      question.templateId,
      question.variantIndex,
      question.lessonId,
      question.baseStageId,
      question.objective,
      question.answerSql,
      JSON.stringify(question.hints),
      JSON.stringify(question.requiredFeatures),
      "exact-result-v1",
      JSON.stringify(question.expectedColumns),
      JSON.stringify(question.expectedRows),
      question.rowsOrdered ? 1 : 0,
      JSON.stringify(question.planInclude),
      JSON.stringify(question.planExclude),
    ],
  );
  database.run(
    "INSERT INTO question_lessons(question_id, lesson_id, is_primary) VALUES (?, ?, 1)",
    [question.questionId, question.lessonId],
  );
}

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const vite = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
  });
  try {
    const [
      { INITIAL_MONSTERS, LESSONS },
      { BIOME_ENCOUNTERS },
      { lessonsForFloor },
      { SqlEngine },
      { QUESTION_BANK_CONFIG, QUESTION_BANK_TIERS },
    ] = await Promise.all([
      vite.ssrLoadModule("/src/content/mvpLevel.ts"),
      vite.ssrLoadModule("/src/content/biomeContent.ts"),
      vite.ssrLoadModule("/src/domain/runGraph.ts"),
      vite.ssrLoadModule("/src/sql/SqlEngine.ts"),
      vite.ssrLoadModule("/src/config/questionBankConfig.ts"),
    ]);
    const {
      version: bankVersion,
      schemaVersion,
      firstFloor,
      floorCount,
      variantsPerFamily,
      familiesPerFloor,
      familiesPerTier,
      reviewFamiliesPerFloor,
      reviewStartsAtFloor,
      reviewTier,
      questionsPerFloor,
      totalQuestions,
      databaseUrl,
      generationVariantSearchLimit,
      planEvidenceFloor,
    } = QUESTION_BANK_CONFIG;
    const lastFloor = firstFloor + floorCount - 1;
    const lessonById = new Map(LESSONS.map((lesson) => [lesson.id, lesson]));
    const monsterById = new Map(INITIAL_MONSTERS.map((monster) => [monster.id, monster]));
    const authored = [];
    for (let floor = firstFloor; floor <= lastFloor; floor += 1) {
      for (const lessonId of lessonsForFloor(floor)) {
        const lesson = lessonById.get(lessonId);
        if (!lesson) throw new Error(`缺少课程 ${lessonId}`);
        lesson.stages.forEach((stage) => authored.push({ floor, lesson, stage }));
      }
    }
    const encounters = BIOME_ENCOUNTERS.flatMap((encounter) => {
      const monster = monsterById.get(encounter.monsterId);
      if (!monster) throw new Error(`缺少生态怪物 ${encounter.monsterId}`);
      const lesson = lessonById.get(monster.lessonId);
      if (!lesson) throw new Error(`缺少生态怪物课程 ${monster.lessonId}`);
      return encounter.stages.map((stage) => ({
        floor: encounter.floor,
        lesson,
        stage,
        role: encounter.role,
      }));
    });

    const SQL = await initSqlJs();
    const database = new SQL.Database();
    const engine = await SqlEngine.create(
      [...INITIAL_MONSTERS],
      resolve(root, "node_modules/sql.js/dist/sql-wasm.wasm"),
    );
    const domains = buildDomains(engine, INITIAL_MONSTERS, firstFloor);
    const monstersByFloor = new Map(Array.from({ length: floorCount }, (_, index) => {
      const floor = firstFloor + index;
      return [
        floor,
        INITIAL_MONSTERS.filter((monster) => monster.floor === floor)
          .map((monster) => monster.id),
      ];
    }));
    database.run(`
      PRAGMA user_version = ${schemaVersion};
      CREATE TABLE bank_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE questions (
        question_id TEXT PRIMARY KEY,
        bank_version TEXT NOT NULL,
        floor INTEGER NOT NULL CHECK(floor BETWEEN ${firstFloor} AND ${lastFloor}),
        scope TEXT NOT NULL CHECK(scope IN ('current', 'review')),
        tier TEXT NOT NULL CHECK(tier IN (${QUESTION_BANK_TIERS.map((tier) => `'${tier}'`).join(", ")})),
        template_id TEXT NOT NULL,
        variant_index INTEGER NOT NULL CHECK(variant_index BETWEEN 1 AND ${variantsPerFamily}),
        primary_lesson_id TEXT NOT NULL,
        base_stage_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        answer_sql TEXT NOT NULL,
        hints_json TEXT NOT NULL,
        required_features_json TEXT NOT NULL,
        expectation_kind TEXT NOT NULL,
        expected_columns_json TEXT NOT NULL,
        expected_rows_json TEXT NOT NULL,
        rows_ordered INTEGER NOT NULL,
        plan_include_json TEXT NOT NULL,
        plan_exclude_json TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1))
      );
      CREATE TABLE question_lessons (
        question_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        is_primary INTEGER NOT NULL CHECK(is_primary IN (0, 1)),
        PRIMARY KEY(question_id, lesson_id)
      );
      CREATE INDEX idx_questions_floor_tier_scope
        ON questions(floor, tier, scope, enabled);
      CREATE INDEX idx_questions_lesson
        ON questions(primary_lesson_id, enabled);
      CREATE INDEX idx_questions_template
        ON questions(template_id, variant_index);
    `);
    const metadata = {
      bankVersion,
      schemaVersion: String(schemaVersion),
      floorCount: String(floorCount),
      questionsPerFloor: String(questionsPerFloor),
      generatedFrom: "src/content/*Level.ts",
    };
    Object.entries(metadata).forEach(([key, value]) => {
      database.run("INSERT INTO bank_metadata(key, value) VALUES (?, ?)", [key, value]);
    });

    for (let floor = firstFloor; floor <= lastFloor; floor += 1) {
      const floorAuthored = authored.filter((entry) => entry.floor === floor);
      const floorEncounters = encounters.filter((entry) => entry.floor === floor);
      const l1Current = uniqueStages([
        ...floorAuthored,
        ...floorEncounters.filter((entry) => entry.role === "normal"),
        ...floorEncounters.filter((entry) => entry.role === "mini-elite"),
      ]);
      const l2Current = uniqueStages([
        ...floorEncounters.filter((entry) => entry.role !== "normal"),
        ...[...floorAuthored].reverse(),
        ...floorEncounters.filter((entry) => entry.role === "normal"),
      ]);
      const l3Current = uniqueStages([
        ...floorEncounters.filter((entry) => entry.role === "area-boss"),
        ...floorEncounters.filter((entry) => entry.role === "mini-elite"),
        ...[...floorAuthored].reverse(),
        ...floorEncounters.filter((entry) => entry.role === "normal"),
      ]);
      const review = uniqueStages([
        ...authored,
        ...encounters,
      ].filter((entry) => (
        entry.floor < floor && /^\s*(?:SELECT|WITH)\b/iu.test(entry.stage.answerSql)
      )));
      const reviewFamilyCount = floor >= reviewStartsAtFloor ? reviewFamiliesPerFloor : 0;
      const usedFamilyStageIds = new Set();
      const addFamilies = (candidates, count, tier, scope, offset = 0) => {
        const selected = questionFamilies(
          candidates,
          count,
          tier,
          scope,
          offset,
          usedFamilyStageIds,
        );
        selected.forEach((family) => usedFamilyStageIds.add(family.entry.stage.id));
        return selected;
      };
      const families = [
        ...addFamilies(
          l1Current,
          familiesPerTier.L1 - reviewFamilyCount,
          "L1",
          "current",
        ),
        ...addFamilies(l2Current, familiesPerTier.L2, "L2", "current", floor),
        ...addFamilies(l3Current, familiesPerTier.L3, "L3", "current", floor * 2),
        ...(reviewFamilyCount > 0
          ? addFamilies(review, reviewFamilyCount, reviewTier, "review", floor)
          : []),
      ];
      if (families.length !== familiesPerFloor) {
        throw new Error(`F${floor} 模板族数量 ${families.length}，预期 ${familiesPerFloor}`);
      }
      const usedQuestionContent = new Set();
      families.forEach((family, familyIndex) => {
        const templateId = `f${floor}-${family.tier}-${family.scope}-${String(familyIndex + 1).padStart(2, "0")}`;
        for (let variantIndex = 1; variantIndex <= variantsPerFamily; variantIndex += 1) {
          const entry = family.entry;
          let variant;
          let result;
          let lastError;
          let emptyFallback;
          for (let attempt = 0; attempt < generationVariantSearchLimit; attempt += 1) {
            variant = materialVariant(
              entry.stage,
              floor,
              familyIndex,
              variantIndex,
              attempt,
              domains,
              monstersByFloor,
              QUESTION_BANK_CONFIG,
            );
            try {
              const candidateResult = engine.execute(
                variant.answerSql,
                floor,
                entry.lesson.id,
              );
              if (candidateResult.rows.length === 0) {
                const explicitEmptyVariant = {
                  ...variant,
                  objective: `${variant.objective} 若无符合条件的记录，应返回空结果。`,
                };
                const emptyContentKey = `${explicitEmptyVariant.objective}\u0000${explicitEmptyVariant.answerSql}`;
                if (!emptyFallback && !usedQuestionContent.has(emptyContentKey)) {
                  emptyFallback = {
                    variant: explicitEmptyVariant,
                    result: candidateResult,
                    contentKey: emptyContentKey,
                  };
                }
                continue;
              }
              const contentKey = `${variant.objective}\u0000${variant.answerSql}`;
              if (usedQuestionContent.has(contentKey)) continue;
              result = candidateResult;
              usedQuestionContent.add(contentKey);
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (!result && emptyFallback) {
            variant = emptyFallback.variant;
            result = emptyFallback.result;
            usedQuestionContent.add(emptyFallback.contentKey);
          }
          if (!variant || !result) {
            throw new Error(
              `F${floor} ${templateId} ${entry.stage.id} v${variantIndex} 无法生成可执行参数变体：${String(lastError)}`,
            );
          }
          insertQuestion(database, {
            questionId: `${bankVersion}:f${floor}:${family.scope}:t${String(familyIndex + 1).padStart(2, "0")}:v${variantIndex}`,
            bankVersion,
            floor,
            scope: family.scope,
            tier: family.tier,
            templateId,
            variantIndex,
            lessonId: entry.lesson.id,
            baseStageId: entry.stage.id,
            objective: variant.objective,
            answerSql: variant.answerSql,
            hints: variant.hints,
            requiredFeatures: entry.stage.requiredFeatures,
            expectedColumns: result.columns,
            expectedRows: result.rows.map((row) => (
              result.columns.map((column) => row[column] ?? null)
            )),
            rowsOrdered: /\border\s+by\b/iu.test(variant.answerSql),
            planInclude: floor === planEvidenceFloor ? planEvidence(result.plan) : [],
            planExclude: [],
          });
        }
      });
    }

    const output = database.export();
    database.close();
    const outputDirectory = resolve(root, "public/data");
    await mkdir(outputDirectory, { recursive: true });
    const databaseName = databaseUrl.split("/").at(-1);
    if (!databaseName) throw new Error("题库 SQLite 输出路径无效");
    const digest = createHash("sha256").update(output).digest("hex");
    await writeFile(resolve(outputDirectory, databaseName), output);
    await writeFile(
      resolve(outputDirectory, "question-bank-manifest.json"),
      `${JSON.stringify({
        bankVersion,
        schemaVersion,
        url: databaseUrl,
        byteLength: output.byteLength,
        sha256: digest,
        questionCount: totalQuestions,
      }, null, 2)}\n`,
    );
  } finally {
    await vite.close();
  }
}

await main();
