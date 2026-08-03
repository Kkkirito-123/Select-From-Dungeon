# 课程怪、精英怪与 Boss 素材及题目设计稿

状态：`DRAFT_FOR_REVIEW`
设计范围：F1–F8 课程怪视觉边界、精英怪、区域首领、楼层 Boss、固定题目种子与掉落。
非实现权威：本稿通过评审前，不改变现有怪物 ID、课程 ID、题目、存档或运行时逻辑。

## 1. 设计目标

本设计解决四个问题：

1. 课程怪不能继续使用普通生态小怪的身体，只靠名字或颜色区分。
2. 精英怪必须有独立轮廓、独立两阶段题目和唯一攻略遗物。
3. 区域首领和楼层 Boss 的题目、外形与当前楼层剧情必须表达同一件事。
4. 怪物存活时只显示稳定 ID；本稿中的名称是制作与击败后恢复身份使用的工作名。

剧情主轴保持为：玩家的身份记录被裁去，但其查询、恢复与迁移轨迹仍能被数据库证据证明。怪物不是 SQL 关键字的卡通化，而是维护、扭曲或封锁这些记录的城内实体。

## 2. 强敌分工

| 类型 | 题目职责 | 剧情职责 | 奖励职责 |
| --- | --- | --- | --- |
| 课程怪 | 单一新概念与边界情况 | 恢复一条局部记录 | 课程印记；少量固定装备 |
| 小型精英 | 两个已学概念的组合题 | 提供可选证据碎片 | 每层唯一攻略遗物 |
| 区域首领 | 两阶段区域综合题 | 改变区域状态并开放后路 | 区域通行证明，不掉随机装备 |
| 楼层 Boss | 本层课程结算题组 | 恢复一章主线记录 | 楼层钥匙与固定剧情页 |

## 3. 素材制作规则

### 3.1 尺寸和动画

- 普通小怪：`32×32`；课程怪与精英怪：`48×48`；楼层 Boss：`64×64`。
- 基础动画：待机 4 帧、移动 4 帧、攻击 4 帧、受击 2 帧、死亡 4 帧。
- 强敌在灰度剪影下也必须可区分；换色、单纯放大或增加统一光环不算独立模型。
- 精英怪至少改变头部、躯干和一种外伸结构；Boss 至少具有三个可独立运动的视觉部件。
- 所有像素素材使用最近邻缩放，不使用抗锯齿。

### 3.2 身份边界

- 世界、战斗、提示与血条在怪物存活时只显示 `ID #NNN`。
- 已解锁图鉴仍可显示永久名称，但不能让新 Run 中的活体提前显示名字。
- 最后一击后，结算页显示“恢复名称：名称”，并将名称写入怪物图鉴。
- 素材文件以稳定 ID 命名，不以中文名称作为运行时键。

### 3.3 题目边界

- 本稿中的参考 SQL 必须在现有教学夹具或隔离沙箱中执行。
- 题目描述不显示“练习卷 x/8”等生成痕迹。
- 小型精英只使用已完成或当前已开放的课程；不能越级教授新语法。
- 题目变体必须改变目标值、阈值、结果集或执行证据，不能只更换编号。
- 提示分三层：目标表和字段、结构约束、结果差异。攻略遗物触发的提示也必须记入复盘。

## 4. 八层剧情与视觉主轴

| 楼层 | 剧情问题 | 强敌视觉材料 | Boss 击败后恢复的事实 |
| --- | --- | --- | --- |
| F1 余烬档案 | 为什么当前居民表没有玩家记录 | 纸页、黄铜、水轮、旧木 | 记录缺失，但恢复许可仍有效 |
| F2 潮汐群岛 | 被水打乱的记录如何重新排序与连接 | 船木、贝壳、镜片、绳链 | 多表中的位置仍能指向同一旅人 |
| F3 白霜墓原 | 一条记录如何通过关系找到所属与上级 | 骨、墓碑、锁链、幽火 | 身份不是单行，而是一组可审计关系 |
| F4 三相升炉 | 重复出现的命令从何处递归而来 | 火晶、冰镜、雷纹、递归环 | 多层依赖最终指向同一条未完成命令 |
| F5 黑铁外城 | 谁定义了记录的顺序、名次和可见窗口 | 黑铁、旗帜、钟盘、岗灯 | 顺序规则塑造了守卫看到的现实 |
| F6 龙脊工坊 | 改写记录后如何安全返回 | 龙鳞、铆钉、火漆、回滚环 | 可验证的改变必须允许局部撤销 |
| F7 索引王苑 | 路径更快是否等于结果正确 | 树根、水晶、枝页、计划镜 | 索引只决定抵达方式，不决定事实 |
| F8 黑金高堂 | 多版本、锁、复制与权限如何共同造成失名 | 黑曜石、金线、锁链、重影 | 玩家完成 MIGRATE 后成为可追溯的历史记录 |

## 5. 第一层课程怪垂直样板

第一层先建立“课程怪不等于小怪”的视觉标准，后续七层按同一标准扩展。

### 5.1 ID #001：页偶（SELECT / FROM）

- 外形：五张悬浮纸页组成无腿人形，中央纸页有一条青色选中列；纸页之间留出明显空隙，不能画成史莱姆。
- 动画：攻击时未选中的纸页合拢遮挡中央列；正确查询后中央列发光并穿透遮挡。
- 剧情：它不是撕掉姓名的人，只会把未被选择的字段压回黑暗。
- 固定题一：查询 `id = 1` 的 `weakness`。
  参考：`SELECT weakness FROM monsters WHERE id = 1;`
- 固定题二：查询 `id = 1` 的 `id` 与 `status`。
  参考：`SELECT id, status FROM monsters WHERE id = 1;`
- 掉落：MVP 保留现有过滤弓，以维持第一层早期伤害曲线；同层其他课程不得再次生成过滤弓。

### 5.2 ID #002：闸兽（WHERE / AND）

- 外形：黄铜闸门构成胸腔，四条短腿像排水管；头部只有两片可开合的筛板。
- 动画：错误时同时打开所有闸口释放污水；正确时只保留命中条件的单一路径。
- 剧情：它负责把不符合恢复条件的记录冲回排水渠。
- 固定题一：返回 `room_id = 2` 且 `status = 'escaped'` 的怪物 `id`。
  参考：`SELECT id FROM monsters WHERE room_id = 2 AND status = 'escaped';`
- 固定题二：按 `id = 2` 与 `status = 'escaped'` 返回 `weakness`。
  参考：`SELECT weakness FROM monsters WHERE id = 2 AND status = 'escaped';`
- 掉落：一次性冷却片；过滤弓不在 WHERE 房重复生成。

### 5.3 ID #003：空衣（IS NULL）

- 外形：没有身体的旧斗篷悬在空床上方，胸口是完全透明的洞；一盏紫色提灯照出洞内没有对象。
- 动画：攻击时用空斗篷包住玩家；正确查询后斗篷塌回空床，强调 NULL 不是黑色实体。
- 剧情：它守着有床位但没有主人关联的记录。
- 固定题一：返回 `room_id = 3` 且 `master_id IS NULL` 的怪物 `id`。
  参考：`SELECT id FROM monsters WHERE room_id = 3 AND master_id IS NULL;`
- 固定题二：返回 `master_id IS NULL` 且 `status = 'cursed'` 的怪物 `id`。
  参考：`SELECT id FROM monsters WHERE master_id IS NULL AND status = 'cursed';`
- 掉落：空值提灯。

### 5.4 ID #004：秤偶（COUNT / GROUP BY）

- 外形：躯干由四串计数珠构成，双臂是秤盘；不同 `channel` 的珠子使用不同形状，不只换颜色。
- 动画：攻击时把所有珠子混在一个秤盘；正确查询后珠子按 channel 自动归组。
- 剧情：它把独立信号压成总数，是登记官护盾的计数机关。
- 固定题一：按 `channel` 统计 `monster_id = 4` 的信号数，数量别名为 `total`。
  参考：`SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel;`
- 固定题二：在相同统计上按 `channel` 排序，验证分组稳定呈现。
  参考：`SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 4 GROUP BY channel ORDER BY channel;`
- 掉落：聚合战锤。

## 6. 小型精英设计与固定题目种子

每层精英题库最终有 24 题；本节先定义每个精英的两道规范种子。变体只能由经过验证的数据参数扩展。

### 6.1 F1 ID #009：宝箱怪

- 剧情：它是登记厅里一只没有领取人的补给箱。箱内保存的不是装备，而是两段被截断的基础记录。
- 未唤醒外形：与普通补给宝箱使用同一个 `closed` 帧、同一调色板、同一碰撞框；无眼睛、血条、名字或光环。
- 唤醒外形：箱盖向后折成上颚，账页形成舌头，锁孔裂成牙缝；只有进入战斗后才切换素材。
- 第一题：查询 `id = 6` 的怪物 `id` 与 `status`。
  参考：`SELECT id, status FROM monsters WHERE id = 6;`
- 第二题：查询 `status = 'toxic'` 且 `master_id IS NULL` 的怪物 `id`。
  参考：`SELECT id FROM monsters WHERE master_id IS NULL AND status = 'toxic';`
- 掉落：Schema 之眼。新题自动打开第一层提示，并记录为自动提示。

### 6.2 F2 ID #018：沼蛙

- 剧情：它吞下了没有装备明细的记录，腹部却仍保留怪物主表的轮廓。
- 外形：低伏巨蛙，喉囊像半透明 LEFT 表；右侧背甲故意缺一块，缺口处悬着空装备钩。
- 第一题：LEFT JOIN 后返回 `room_id = 34` 且没有装备记录的怪物 `id`。
  参考：`SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id = 34 AND g.monster_id IS NULL;`
- 第二题：返回 `id = 18` 且 `status = 'toxic'` 的 `id`。
  参考：`SELECT id FROM monsters WHERE id = 18 AND status = 'toxic';`
- 掉落：潮向针。迷路 25 步后显示下一课程目标的方向与距离。

### 6.3 F2 ID #020：古树精

- 剧情：它把怪物记录和房间记录刻在两块树皮上，只有根部的键能把两块树皮重新接合。
- 外形：左右躯干分别是一块怪物树皮和房间树皮，根须在腹部组成 `room_id → id` 的扣合结构。
- 第一题：连接 `monsters` 与 `rooms`，返回 `id = 20` 的 `id` 与 `room_name`。
  参考：`SELECT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20;`
- 第二题：返回 `id = 20` 的 `id` 与 `room_sector`，按 sector 排序并只取一行。
  参考：`SELECT m.id, r.sector AS room_sector FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE m.id = 20 ORDER BY r.sector LIMIT 1;`
- 掉落：与本层共用潮向针；已经获得时不再生成道具。

### 6.4 F3 ID #031：鬼火

- 剧情：它由同一张怪物表中的两条身份重影组成，一条是当前记录，另一条是上级记录。
- 外形：两张上下错位的骨面具共用一团幽火，面具之间以细骨链连接；攻击时交换 child 与 master 位置。
- 第一题：自连接 `monsters`，返回 ID #031 的 `child_id` 与 `master_id`。
  参考：`SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 31;`
- 第二题：返回 `id = 31` 且 `status = 'haunting'` 的 `id`。
  参考：`SELECT id FROM monsters WHERE id = 31 AND status = 'haunting';`
- 掉落：关系线轴。JOIN 题只高亮可关联字段，不提供完整 ON 条件。

### 6.5 F4 ID #042：雷兽

- 剧情：它的身体是否完整，取决于另一张装备表中是否存在对应记录。
- 外形：四足雷兽，胸口是一个空插槽；存在装备记录时插槽出现雷晶，攻击动作由晶体点亮。
- 第一题：用 EXISTS 查询 `id = 42` 且存在装备记录的怪物 `id`。
  参考：`SELECT m.id FROM monsters m WHERE m.id = 42 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);`
- 第二题：返回 `id = 42` 且 `status = 'charged'` 的 `id`。
  参考：`SELECT id FROM monsters WHERE id = 42 AND status = 'charged';`
- 掉落：回声签。错误后只显示子查询结果为 0、1 或多行。

### 6.6 F5 ID #053：铁卫

- 剧情：外城把守卫排成名次，却故意隐藏并列者之间是否应该留出空档。
- 外形：黑铁人形，背后有三片可旋转名次牌；受到正确查询时牌面从无序转为稳定序列。
- 第一题：连接装备表，对 ID #052–#053 按 power 计算 `RANK()`。
  参考：`SELECT m.id, g.power, RANK() OVER (ORDER BY g.power DESC) AS rank_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 52 AND 53 ORDER BY g.power DESC, m.id;`
- 第二题：对 ID #051–#053 使用 `DENSE_RANK()`，保留并列且不制造名次空档。
  参考：`SELECT m.id, DENSE_RANK() OVER (ORDER BY g.power DESC) AS rank_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 53 ORDER BY g.power DESC, m.id;`
- 掉落：定序环。题目要求稳定排序时，提示是否缺少并列处理或次级排序。

### 6.7 F6 ID #064：电龙

- 剧情：它会把候选修改烧进鳞片，但每次雷击结束后都必须证明原始状态能够恢复。
- 外形：细长电龙盘绕一枚回滚环；修改时鳞片变红，ROLLBACK 后恢复蓝白，形成明确前后状态。
- 第一题：BEGIN 后把 `id = 1` 的 `quantity` 改为 8，再 ROLLBACK。
  参考：`BEGIN; UPDATE repair_queue SET quantity = 8 WHERE id = 1; ROLLBACK;`
- 第二题：使用保存点修改 `id = 1`，再局部回滚并提交未改变的状态。
  参考：`BEGIN; SAVEPOINT spark; UPDATE repair_queue SET quantity = 7 WHERE id = 1; ROLLBACK TO spark; RELEASE spark; COMMIT;`
- 掉落：回滚印。每场战斗第一次语法错误不触发反击，但仍记录错误。

### 6.8 F7 ID #075：晶灵

- 剧情：它的身体就是一页覆盖索引；如果查询索取索引之外的字段，晶体内部会出现回表裂纹。
- 外形：透明晶体人形，内部悬浮 `category` 与 `code` 两列；攻击时裂纹向主表方向延伸。
- 第一题：查询 charm 类别的 `category`、`code`，按 code 排序并保持覆盖索引。
  参考：`SELECT category, code FROM index_records WHERE category = 'charm' ORDER BY code;`
- 第二题：使用 category 与 code 范围查询 charm 记录，只返回 code。
  参考：`SELECT code FROM index_records WHERE category = 'charm' AND code >= 'CRY' AND code < 'CRZ' ORDER BY code;`
- 掉落：计划镜。显示本次真实计划是 SCAN、SEARCH 还是 COVERING。

### 6.9 F8 ID #087：魔将

- 剧情：它同时保留事务前后的两道重影，并利用隔离异常让玩家误以为两次读取必然相同。
- 外形：黑金铠甲包裹两层错位身体，左影较暗、右影较亮；锁链从后方另一事务延伸到胸甲。
- 第一题：查询 `phantom_read` 的 `first_count` 与 `second_count`。
  参考：`SELECT first_count, second_count FROM isolation_cases WHERE phenomenon = 'phantom_read';`
- 第二题：查询被 T2 阻塞的等待事务和资源。
  参考：`SELECT waiter_tx, blocker_tx, resource FROM lock_waits WHERE blocker_tx = 'T2' ORDER BY waiter_tx;`
- 掉落：封口蜡。安全题中标出未参数化、权限过大或禁止执行的风险字段，不提供答案。

## 7. 区域首领设计与固定题目

区域首领只改变区域状态、开放物理后路并提供故事证据，不制造随机装备。

### 7.1 F2 ID #021：湖兽

- 外形：鳐形水兽，背部七盏浮标灯按 charge 高低升降；重复 channel 使用同形灯片。
- 剧情：水面把相同导航信号复制并打乱，玩家必须先恢复优先级。
- 第一击：取 `monster_id = 21` charge 最高的前两条 channel、charge。
  参考：`SELECT channel, charge FROM monster_signals WHERE monster_id = 21 ORDER BY charge DESC LIMIT 2;`
- 第二击：去重返回该怪物的 channel 并排序。
  参考：`SELECT DISTINCT channel FROM monster_signals WHERE monster_id = 21 ORDER BY channel;`
- 区域变化：湖面浮标按真实顺序点亮，开放灯塔航线。

### 7.2 F2 ID #022：蛙王

- 外形：巨型沼蛙，背部挂着空装备架，喉囊内可见完整怪物主表轮廓。
- 剧情：它证明“右表缺失”不应让左表怪物从世界中消失。
- 第一击：LEFT JOIN 后返回没有装备记录的 ID #022。
  参考：`SELECT m.id FROM monsters m LEFT JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 22 AND g.monster_id IS NULL;`
- 第二击：连接怪物与二层房间，去重返回 ID 与 room_name。
  参考：`SELECT DISTINCT m.id, r.name AS room_name FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 AND m.id = 22 ORDER BY m.id;`
- 区域变化：沼泽下沉，露出通往中区的木桥。

### 7.3 F3 ID #033：墓主

- 外形：三层骨坛分别代表 monsters、rooms、monster_gear，脊柱向上连接一具主人骨架。
- 剧情：它把房间、装备和上级关系拆散，试图让任何单表证据都无法成立。
- 第一击：连接三张表，返回 ID、room_name 与 power。
  参考：`SELECT m.id, r.name AS room_name, g.power FROM monsters m INNER JOIN rooms r ON m.room_id = r.id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 33;`
- 第二击：自连接返回它的 child_id 与 master_id。
  参考：`SELECT child.id AS child_id, master.id AS master_id FROM monsters child INNER JOIN monsters master ON child.master_id = master.id WHERE child.id = 33;`
- 区域变化：骨桥重新连接，失名录增加一条关系证据。

### 7.4 F4 ID #044：霜炉主

- 外形：冰镜包裹的炉体，内部有装备晶核；镜面只反射“存在”或“不存在”，不显示装备内容。
- 剧情：它是中区硬阻挡，也是四层回燃残响出现的条件。
- 第一击：用 IN 子查询确认 ID #044 属于 power 不低于 22 的装备持有者。
  参考：`SELECT id FROM monsters WHERE id = 44 AND id IN (SELECT monster_id FROM monster_gear WHERE power >= 22);`
- 第二击：用 EXISTS 证明 ID #044 存在装备记录。
  参考：`SELECT m.id FROM monsters m WHERE m.id = 44 AND EXISTS (SELECT 1 FROM monster_gear g WHERE g.monster_id = m.id);`
- 区域变化：冰镜破裂，显出第一层余烬回声门。

### 7.5 F5 ID #055：堡主

- 外形：黑铁堡垒人形，背后五面 rank 旗，左右武器分别是 LAG 与 LEAD 岗灯。
- 剧情：它通过改变窗口顺序制造虚假的先后关系。
- 第一击：对 ID #051–#055 按 power 计算 RANK，并按 id 返回。
  参考：`SELECT m.id, RANK() OVER (ORDER BY g.power DESC) AS rank_no FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 55 ORDER BY m.id;`
- 第二击：用 LAG 与 LEAD 返回前后 power。
  参考：`SELECT m.id, LAG(g.power) OVER (ORDER BY m.id) AS prev_power, LEAD(g.power) OVER (ORDER BY m.id) AS next_power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 51 AND 55 ORDER BY m.id;`
- 区域变化：岗灯按真实前后关系连接，开放后城。

### 7.6 F6 ID #066：古龙

- 外形：巨龙鳞片刻成 repair_queue 行，胸口有一片负 quantity 的破鳞；尾部像事务日志卷轴。
- 剧情：它会吞下错误写入，迫使玩家证明约束和精确删除都能保护原始数据。
- 第一击：在隔离沙箱中只删除 `id = 4`。
  参考：`DELETE FROM repair_queue WHERE id = 4;`
- 第二击：用 `INSERT OR IGNORE` 尝试写入负 quantity，证明 CHECK 拒绝无效记录。
  参考：`INSERT OR IGNORE INTO repair_queue(id, item, quantity, status) VALUES(9, 'broken-scale', -2, 'ready');`
- 区域变化：破鳞被拒绝，龙脊工坊恢复可回滚状态。

### 7.7 F7 ID #077：林王

- 外形：根系形成可见 B+ 树层级，水晶叶片刻有 code；错误路径会让整片根网发红。
- 剧情：它把“路径短”伪装成“结果真”，玩家必须同时验证结果和计划。
- 第一击：查询 void 区 code、score，真实计划命中 `idx_index_records_realm_score`。
  参考：`SELECT code, score FROM index_records WHERE realm = 'void' ORDER BY score DESC;`
- 第二击：用 category + code 前缀范围返回 boss 类别的 VOI code，计划必须使用 SEARCH。
  参考：`SELECT code FROM index_records WHERE category = 'boss' AND code >= 'VOI' AND code < 'VOJ' ORDER BY code;`
- 区域变化：错误根道枯萎，显示真实可达路径。

### 7.8 F8 ID #089：王兽

- 外形：黑曜石碎片组成四足巨兽，颈部缠着事务等待链，腹部有两圈不同时间的隔离刻度。
- 剧情：它把锁等待与隔离异常揉成同一团噪声，阻止玩家抵达最终王座。
- 第一击：查询 waiter `T3` 的等待链。
  参考：`SELECT waiter_tx, blocker_tx, resource FROM lock_waits WHERE waiter_tx = 'T3';`
- 第二击：返回第二次计数大于第一次计数的隔离异常。
  参考：`SELECT phenomenon, first_count, second_count, prevented_by FROM isolation_cases WHERE second_count > first_count ORDER BY id;`
- 区域变化：等待链断开，开放数据王座前厅。

## 8. 楼层 Boss 设计与固定题组

### 8.1 F1 ID #005：登记官

- 外形：`64×64` 黄铜登记册躯干，背后水轮持续转动；左右手是两个分组秤盘，胸前封条只有 HAVING 命中后才裂开。
- 剧情：它没有删除玩家，而是把玩家所在分组挡在恢复阈值之外。
- 护盾阶段：只保留 `monster_id = 5` 中信号数不少于 2 的 channel。
  参考：`SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 2;`
- 核心阶段：把阈值提高到 3，只留下最强 echo 组。
  参考：`SELECT channel, COUNT(*) AS total FROM monster_signals WHERE monster_id = 5 GROUP BY channel HAVING COUNT(*) >= 3;`
- 击败叙事：水轮停止倒转，恢复许可从被过滤分组中显现。
- 掉落：第一层钥匙与剧情页《火记得你》；不随机掉落装备。

### 8.2 F2 ID #014：灯塔守卫

- 外形：船木与黄铜组成的四臂巨像，头部是旋转灯塔镜片；两条手臂牵引 rooms，另两条牵引 monsters 与 gear。
- 剧情：它把同一条记录投向不同岛屿，使玩家必须依靠键关系而不是肉眼追踪。
- 护盾阶段：连接 monsters 与 rooms，统计二层每个 sector 的怪物数，保留至少 3 只的组并排序。
  参考：`SELECT r.sector, COUNT(*) AS total FROM monsters AS m INNER JOIN rooms AS r ON m.room_id = r.id WHERE r.floor = 2 GROUP BY r.sector HAVING COUNT(*) >= 3 ORDER BY total DESC, r.sector ASC;`
- 核心阶段：连接 monsters 与 gear，返回 ID #014 的最高 power。
  参考：`SELECT m.id, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id = 14 ORDER BY g.power DESC LIMIT 1;`
- 击败叙事：灯塔只照亮一组一致键值，确认漂流记录来自同一来源。
- 掉落：第二层钥匙与剧情页《同一坐标》。

### 8.3 F3 ID #028：死灵王

- 外形：骨制王座与六根关系链组成躯干，链末分别挂房间牌、装备牌与主人牌；王冠是断裂的主键环。
- 剧情：它宣称单行姓名才是身份，玩家用跨表审计证明身份可以由关系恢复。
- 分组审计：连接 rooms 与 monsters，统计三层 room 41–46 的 sector 数量并保留至少 2 条的组。
  参考：`SELECT r.sector, COUNT(*) AS total FROM rooms r INNER JOIN monsters m ON r.id = m.room_id WHERE r.floor = 3 AND m.room_id BETWEEN 41 AND 46 GROUP BY r.sector HAVING COUNT(*) >= 2 ORDER BY r.sector;`
- 装备审计：返回 room 41–46 中装备 power 最高的怪物 ID 与 power。
  参考：`SELECT m.id, g.power FROM monsters m INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.room_id BETWEEN 41 AND 46 ORDER BY g.power DESC LIMIT 1;`
- 击败叙事：关系链不再指向王座，而是指向失名者留下的可验证轨迹。
- 掉落：第三层钥匙与剧情页《关系仍在》。

### 8.4 F4 ID #039：元素王

- 外形：火、冰、雷三个核心围绕空心王体旋转；背后递归环每次攻击多亮一层，最多三层。
- 剧情：三种元素事故都来自同一条仍为 OPEN 的上游命令，Boss 试图让追踪永远循环。
- 房间递归：递归生成 room id 51–53，连接 rooms 返回房间名。
  参考：`WITH RECURSIVE room_ids(id) AS (SELECT 51 UNION ALL SELECT id + 1 FROM room_ids WHERE id < 53) SELECT r.name AS room_name FROM rooms r INNER JOIN room_ids x ON r.id = x.id ORDER BY r.id;`
- 血缘递归：从 `id = 34` 出发沿 master_id 追踪三层，返回 id 与 depth。
  参考：`WITH RECURSIVE lineage(id, master_id, depth) AS (SELECT id, master_id, 1 FROM monsters WHERE id = 34 UNION ALL SELECT m.id, m.master_id, l.depth + 1 FROM monsters m INNER JOIN lineage l ON m.id = l.master_id WHERE l.depth < 3) SELECT id, depth FROM lineage ORDER BY depth;`
- 击败叙事：三个核心归入同一来源，第一层余烬回声被证明并非幻觉。
- 掉落：第四层钥匙与剧情页《命令源》。

### 8.5 F5 ID #050：城主

- 外形：黑铁城门构成胸甲，六面军旗按 sector 展开；胸口钟盘显示当前窗口，排名牌随 ROW_NUMBER 改变。
- 剧情：它通过定义排序和窗口，让同一批记录在不同人眼中拥有不同位置。
- 每区第一名：用 CTE 和 ROW_NUMBER 返回 ID #045–#050 每个 sector 的第一名。
  参考：`WITH ranked AS (SELECT r.sector, m.id, g.power, ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id) AS rn FROM monsters m INNER JOIN rooms r ON m.room_id = r.id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 50) SELECT sector, id, power FROM ranked WHERE rn = 1 ORDER BY sector;`
- 每区前两名：返回 outer 与 arena 各前 2 名。
  参考：`WITH ranked AS (SELECT r.sector, m.id, ROW_NUMBER() OVER (PARTITION BY r.sector ORDER BY g.power DESC, m.id) AS rn FROM monsters m INNER JOIN rooms r ON m.room_id = r.id INNER JOIN monster_gear g ON m.id = g.monster_id WHERE m.id BETWEEN 45 AND 48) SELECT sector, id, rn FROM ranked WHERE rn <= 2 ORDER BY sector, rn;`
- 击败叙事：城内首次公开排序规则，玩家不再只是被排列的未知行。
- 掉落：第五层钥匙与剧情页《谁定义顺序》。

### 8.6 F6 ID #061：龙王

- 外形：龙鳞像事务日志逐片覆盖身体，双翼分别刻 SAVEPOINT 与 COMMIT；尾部可回卷到任一保存点。
- 剧情：它允许改变，但只承认能够解释、局部撤销并最终提交的改变。
- 局部撤销：修复 id 2，保存 clean，删除 id 3，再回到 clean 并提交。
  参考：`BEGIN; UPDATE repair_queue SET status = 'fixed' WHERE id = 2; SAVEPOINT clean; DELETE FROM repair_queue WHERE id = 3; ROLLBACK TO clean; COMMIT;`
- 保存后提交：建立 repair 保存点，修复 id 2、删除 id 4，释放保存点并提交。
  参考：`BEGIN; SAVEPOINT repair; UPDATE repair_queue SET status = 'fixed' WHERE id = 2; DELETE FROM repair_queue WHERE id = 4; RELEASE repair; COMMIT;`
- 击败叙事：错误候选被撤销，正确修复被保留，玩家取得可追溯修改权。
- 掉落：第六层钥匙与剧情页《允许撤回》。

### 8.7 F7 ID #072：古树

- 外形：树冠是三层 B+ 树节点，水晶叶片刻有 code；根部计划镜实时显示 SCAN、SEARCH 或 COVERING。
- 剧情：它用最快路径诱导玩家相信错误结果，要求结果与代价同时成立。
- Top 查询：返回 crystal 区 score 不低于 80 的前两名。
  参考：`SELECT code, score FROM index_records WHERE realm = 'crystal' AND score >= 80 ORDER BY score DESC LIMIT 2;`
- 覆盖查询：只用覆盖索引返回 boss 类别 code。
  参考：`SELECT code FROM index_records WHERE category = 'boss' ORDER BY code;`
- 击败叙事：古树保留所有真实路径，但不再把路径冒充事实。
- 掉落：第七层钥匙与剧情页《路径不是答案》。

### 8.8 F8 ID #084：档案王

- 外形：黑金王体由五层可分离结构组成：版本披风、锁链双臂、隔离面具、复制翼、权限王冠。每过一阶段脱落一层。
- 剧情：它不是单一恶意角色，而是五种未经约束的数据库机制叠加后形成的失名事故。
- 第一阶段·版本可见性：返回事务 12 可见且 `row_id = 2` 的 value。
  参考：`SELECT value FROM tx_versions WHERE row_id = 2 AND created_tx <= 12 AND (expired_tx IS NULL OR expired_tx > 12);`
- 第二阶段·锁等待：返回被 T2 阻塞的 waiter_tx 与 resource。
  参考：`SELECT waiter_tx, resource FROM lock_waits WHERE blocker_tx = 'T2' ORDER BY waiter_tx;`
- 第三阶段·隔离异常：返回 phantom_read 的 prevented_by。
  参考：`SELECT prevented_by FROM isolation_cases WHERE phenomenon = 'phantom_read';`
- 第四阶段·复制路由：返回不健康副本的 node、lag_ms。
  参考：`SELECT node, lag_ms FROM replica_status WHERE role = 'replica' AND healthy = 0 ORDER BY lag_ms DESC;`
- 第五阶段·查询安全：返回同时参数化、最小权限且允许执行的方法。
  参考：`SELECT method FROM security_cases WHERE parameterized = 1 AND least_privilege = 1 AND allowed = 1 ORDER BY id;`
- 击败叙事：五层结构分别成为 MIGRATE 的证据页；玩家不是被恢复为旧记录，而是写入一条带来源、版本与权限边界的新历史。
- 掉落：第八层钥匙；随后进入七页 MIGRATE 程序，不再生成随机战利品。

## 9. 掉落与剧情证据规则

### 9.1 小型精英

- 每层第一只精英首次击败时获得本层唯一攻略遗物。
- 同层其他精英只提供首次 XP 与可选证据，不重复生成遗物。
- 重复挑战不重复掉落，不把重复遗物转换成另一件随机装备。

### 9.2 区域首领

- 掉落为非背包的“区域通行证明”，立即改变物理路线或世界状态。
- 区域通行证明不能随机，也不能占用装备栏。
- 区域首领可以新增一条失名录证据，但不能成为主线通关的额外随机条件。

### 9.3 楼层 Boss

- 只掉楼层钥匙与固定剧情页。
- Boss 不掉普通恢复品、不重复掉课程装备。
- 击败结算顺序固定为：事实结果 → 恢复名称 → 世界变化 → 剧情页 → 楼层钥匙。

## 10. 素材清单与导出约定

每个强敌素材包至少包含：

```text
entity.json
world.png
battle.png
portrait.png
silhouette.png
palette.json
license.json
```

`entity.json` 至少记录：稳定 ID、楼层、角色、帧尺寸、动画区间、碰撞框、世界缩放、战斗缩放、隐藏身份标签、素材版本。宝箱怪额外记录与普通宝箱共享的 `closedFrameId`；二者导出后的关闭帧像素哈希必须相同。

## 11. 验收标准

- F1 五只课程怪、宝箱怪和登记官在无文字灰度图中仍可区分。
- F1 宝箱怪唤醒前与普通宝箱关闭帧像素完全一致。
- 九只小型精英都有两道可执行规范题种子和独立轮廓。
- 八类区域首领全部拥有两阶段题、世界变化和剧情证据。
- 八层楼层 Boss 题组与现有课程夹具一致；F8 保持五阶段事故链。
- 强敌存活时不显示名称；击败后才恢复名称并写入图鉴。
- 每层攻略遗物最多出现一次，固定课程装备不重复。
- 后续扩展出的题目变体必须通过 SQL 执行、语义结果和去重检查。

## 12. 风险与评审点

- 47 只课程怪全部独立绘制工作量较大，应先完成 F1 素材包并进行视觉评审，再扩展 F2–F8。
- 本稿部分新增精英第二题尚未进入运行时判题器；实现阶段必须先补语义契约与测试，不能只验证 SQL 可执行。
- 区域首领外形与地形机关需要共享锚点；素材完成前不能假定当前空气墙就是最终物理边界。
- 攻略遗物改变提示或伤害规则，必须继续写入学习记录，防止 Agent 将辅助后的正确率误判为独立掌握。
