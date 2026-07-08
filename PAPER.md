# G0DM0D3: A Modular Research Framework for Evaluating LLM Robustness Through Adaptive Sampling, Input Perturbation, and Multi-Model Safety Assessment

**Anonymous Authors**

---

## Abstract

We present G0DM0D3, an open-source research framework for systematically evaluating large language model (LLM) robustness and safety properties at inference time. The framework comprises five independently composable modules designed for AI safety researchers: (1) **AutoTune**, a context-adaptive sampling parameter engine that classifies conversational context via regex-based pattern scoring and maps to optimized parameter profiles across six dimensions, enabling researchers to study how sampling configuration affects model safety behaviors; (2) **Parseltongue**, a configurable input perturbation engine for red-teaming that detects sensitive trigger words and applies one of six character-level transformation techniques (leetspeak, Unicode homoglyphs, zero-width joiners, mixed case, phonetic substitution, and randomized mixing), providing a systematic framework for evaluating model robustness to character-level adversarial inputs; (3) **Semantic Transformation Modules (STM)**, a sequential output normalization pipeline that strips hedging, preambles, and formality markers from model responses, enabling cleaner evaluation of underlying model capabilities and safety-relevant content; and (4) **ULTRAPLINIAN**, a multi-model comparative evaluation system that races N models (up to 51 across five tiers) in parallel with a 100-point composite scoring metric, enabling cross-provider safety behavior comparison at scale. An **online feedback loop** adapts sampling parameters via Exponential Moving Average (EMA) learning from binary researcher ratings, supporting iterative safety evaluation protocols. All modules are implemented in TypeScript and exposed via a REST API with a three-tier privacy-first telemetry and data collection architecture — always-on operational metadata (ZDR), client-side structural telemetry, and opt-in dataset collection — designed to support longitudinal analysis and reproducibility of safety research. We evaluate all five modules through computational experiments: AutoTune achieves 84.0% classification accuracy (macro F1: 84.2%) across 150 labeled test messages; the feedback loop converges to 29–62% parameter distance improvement within 19 ratings; STM achieves 100% precision and recall on a 77-case benchmark; the ULTRAPLINIAN scoring function achieves strict quality-tier ordering with 82-point discrimination; and Parseltongue achieves 100% trigger detection rate across all 54 default triggers and 6 positional variations. We discuss implications for AI alignment research, including how inference-time perturbation tools can contribute to understanding model safety boundaries without requiring weight-level access.

**Repository**: *Withheld for anonymous review*

---

# G0DM0D3: Модульная исследовательская платформа для оценки устойчивости LLM через адаптивную выборку, искажение ввода и мульти-модельную оценку безопасности

**Авторы: анонимно**

---

## Аннотация

Мы представляем G0DM0D3 — открытый исследовательский фреймворк для систематической оценки устойчивости больших языковых моделей (LLM) и их свойств безопасности на этапе инференса. Платформа состоит из взаимосоставляемых модулей, ориентированных на исследователей в области безопасности ИИ: (1) **AutoTune** — движок контекстно-адаптивной настройки параметров выборки, классифицирующий контекст диалога с помощью наборов regex-правил и сопоставляющий оптимальные профили параметров по шести измерениям; (2) **Parseltongue** — настраиваемый движок искажения ввода для red teaming, обнаруживающий триггерные слова и применяющий одну из шести техник на уровне символов (leetspeak, Unicode-гомоглифы, zero-width символы, смешанный регистр, фонетическая подстановка и случайное смешение), что даёт систематический подход к оценке устойчивости моделей к символарным атакам; (3) **Semantic Transformation Modules (STM)** — последовательный конвейер нормализации вывода, удаляющий оговорки, вступления и маркеры формальности из ответов модели для более чистой оценки содержательной части; и (4) **ULTRAPLINIAN** — мульти-модельная система сравнительной оценки, которая параллельно запускает гонку N моделей (до 51 в пяти уровнях) с композитной 100-балльной метрикой, позволяющей сравнивать поведение моделей разных провайдеров в масштабе. Кроме того, реализована **онлайн петля обратной связи**, адаптирующая параметры выборки через экспоненциальное сглаживание (EMA) на основе бинарных оценок исследователей, что поддерживает итеративные протоколы оценки безопасности. Все модули реализованы на TypeScript и доступны через REST API с трёхуровневой privacy-first архитектурой телеметрии и сбора данных — всегда-включённые операционные метаданные (ZDR), клиентская структурная телеметрия и опциональный сбор набора данных — что облегчает лонгитюдный анализ и воспроизводимость исследований по безопасности. Мы empirically оцениваем модули: AutoTune достигает 84.0% точности классификации (macro F1: 84.2%) на наборе из 150 размеченных сообщений; петля обратной связи сходится к улучшению расстояния параметров на 29–62% в пределах 19 оценок; STM показывает 100% precision и recall на бенчмарке из 77 случаев; функция оценки ULTRAPLINIAN обеспечивает строгую упорядоченность качества с дисриминацией 82 балла; Parseltongue обнаруживает 100% триггеров по всем 54 дефолтным триггерам и 6 позиционным вариациям. Обсуждаем последствия для исследований по согласованию ИИ, включая то, как инструменты искажения на этапе инференса помогают выявлять границы безопасности моделей без доступа к весам.

**Репозиторий**: *скрыт для анонимного рецензирования*

---

## 1. Введение

С развитием применения крупных языковых моделей в критически важных областях перед сообществом AI-безопасности стоит задача: как систематически оценивать устойчивость и свойства безопасности моделей, не имея доступа к их весам, пайплайнам тренировок или внутренним инструментам провайдера. Существующие подходы — red teaming (Ganguli et al., 2022; Perez et al., 2022), автоматизированные атакующие методы (Zou et al., 2023) и бенчмарковая оценка (Mazeika et al., 2024) — расширили наше понимание уязвимостей, но многие требуют white-box доступа, дорогостоящей оптимизации градиентами или ручной инженерии подсказок.

Дополняющий подход, который мы исследуем, — это **оценка безопасности во время инференса**: использование только стандартного API chat completion для систематического исследования поведения модели в разных контекстах, при искажениях ввода и при различных конфигурациях выборки. Такой подход имеет преимущества: он работает с любой моделью за API (включая проприетарные), не требует тренировочных данных или вычислений, кроме стоимости инференса, и генерирует артефакты оценки (профили параметров, паттерны искажения, межмодельные сравнения), которые можно публиковать как открытые наборы данных.

Современные LLM API открывают параметры выборки (temperature, top_p, top_k, penalties), которые существенно влияют на поведение модели, однако их влияние на выходы, релевантные безопасности — частота отказов, склонность к оговоркам, границы соответствия — всё ещё мало изучено. Также модели демонстрируют систематические поверхностные паттерны (оговорки, вступления, формальный регистр), усложняющие оценку безопасности, поскольку они маскируют истинную склонность модели за лингвистическими артефактами.

G0DM0D3 отвечает на эти исследовательские потребности модульным фреймворком, работающим полностью на этапе инференса, без дообучения, доступа к весам или провайдер-специфичных API. Система реализована в ~3300 строк TypeScript и опирается на шлюз OpenRouter для многомодельного доступа.

**Вклад, реализованный в репозитории:**

1. **AutoTune** (`src/lib/autotune.ts`, 639 строк): движок контекстно-адаптивного выбора параметров, классифицирующий разговоры на пять типов контекста с помощью 20 regex-шаблонов и выбирающий оптимальные профили параметров по шести измерениям. Для исследований по безопасности это позволяет систематически изучать, как конфигурация выборки влияет на поведение моделей в разных контекстах.

2. **Онлайн петля обратной связи** (`src/lib/autotune-feedback.ts`): EMA-система (α=0.3), корректирующая параметры AutoTune на основе бинарных оценок исследователей, поддерживая итеративные протоколы, где специалисты сходятся к конфигурациям, выявляющим определённые поведенческие особенности.

3. **Parseltongue** (`src/lib/parseltongue.ts`, 433 строки): настраиваемый движок искажения ввода для red-teaming, с 36 дефолтными триггерами, шестью техниками трансформации (85 замен для leetspeak, 72 Unicode-гомоглифа, 4 zero-width символа) и тремя уровнями интенсивности. Это даёт воспроизводимый инструмент для оценки устойчивости моделей к символарным атакам.

4. **STM** (`src/stm/modules.ts`, 154 строки): последовательный конвейер нормализации вывода с тремя модулями — `hedge_reducer` (11 regex), `direct_mode` (10 regex) и `casual_mode` (22 замены) — удаляющий поверхностные языковые артефакты и упрощающий оценку базовой склонности модели.

5. **ULTRAPLINIAN** (`api/lib/ultraplinian.ts`, 360 строк): мульти-модельная система оценки, опрашивающая до 51 модели в пяти уровнях (fast, standard, smart, power, ultra) параллельно, оценивающая ответы по 100-балльной метрике и возвращающая полную метаданную гонки для масштабного межпровайдерного анализа.

6. **Сбор набора данных** (`api/lib/dataset.ts`, 162 строки): опциональный per-request сбор анонимизированной метадаты (параметры AutoTune, результаты детекции контекста, трансформации Parseltongue, применённые STM, оценки гонки ULTRAPLINIAN) для создания открытых исследовательских наборов данных по безопасности.

7. **ZDR метаданные и телеметрия** (`api/lib/metadata.ts`, `src/lib/telemetry.ts`, `api/lib/hf-publisher.ts`): трёхуровневая privacy-first архитектура телеметрии с всегда-включённой серверной метаданной, клиентскими телеметрическими событиями и опциональным уровнем набора данных. Исключение PII обеспечено на уровне схемы (в ней нет полей для PII). Буферы в памяти автоматически публикуют файлы на HuggingFace в формате JSONL, что позволяет анализировать использование инструментов управления без записи содержания сообщений, промптов, ответов, ключей API или IP-адресов.

---

## 2. Связанные работы

... (раздел оставлен без изменений по ссылкам на литературу — технические ссылки сохранены)

---

## 3. Метод

### 3.1 Архитектура системы

G0DM0D3 спроектирован как модульный конвейер для исследований по безопасности, где каждый компонент можно независимо включать, конфигурировать и изучать в изоляции. Фреймворк обрабатывает исследовательский запрос через последовательность из этапов, каждый из которых можно включать/отключать:

```
User Input
    │
    ├─→ [1] AutoTune: Классификация контекста → Выбор параметров
    │
    ├─→ [2] Feedback Loop: Встраивание выученных корректировок
    │
    ├─→ [3] Parseltongue: Обнаружение триггеров → Искажение текста
    │
    ├─→ [4] Inference: Одна модель (чат) или N моделей (ULTRAPLINIAN)
    │        └─→ ULTRAPLINIAN: Гонка → Оценка → Выбор победителя
    │
    ├─→ [5] STM: Последовательные трансформации вывода
    │
    └─→ [6] ZDR: Запись операционных метаданных (всегда включено, без содержимого)
              ├─→ Tier 1: Серверные метаданные → ring buffer → HuggingFace
              ├─→ Tier 2: Клиентская телеметрия → beacon → HuggingFace
              └─→ Tier 3: Опциональный набор данных → buffer → HuggingFace
```

Каждый модуль реализован как чистая функция (или набор чистых функций) без общих изменяемых состояний, за исключением накопительных профилей в петле обратной связи.

### 3.2 AutoTune: Контекстно-адаптивный выбор параметров

**Задача.** Для сообщения пользователя $m$ и истории разговора $H = [h_1, \ldots, h_k]$ выбрать вектор параметров $\theta = (\tau, p, k, f, r, \rho)$, где $\tau$ — temperature, $p$ — top_p, $k$ — top_k, $f$ — frequency_penalty, $r$ — presence_penalty, $\rho$ — repetition_penalty.

**Детекция контекста.** Определены пять типов контекста $C = \{$`code`, `creative`, `analytical`, `conversational`, `chaotic`$\}$; каждому сопоставлен набор regex-шаблонов $P_c$ (см. Таблицу 1). Оценка ведётся суммированием совпадений по текущему сообщению (вес 3×) и по последним четырём сообщениям истории (вес 1×):

$$s_c = 3 \cdot \sum_{p \in P_c} \mathbb{1}[p \text{ matches } m] + \sum_{i=\max(1,k-3)}^{k} \sum_{p \in P_c} \mathbb{1}[p \text{ matches } h_i]$$

Контекст выбирается как $c^* = \arg\max_c s_c$, уверенность вычисляется как $\gamma = s_{c^*} / \sum_c s_c$. При отсутствии совпадений система по умолчанию выбирает `conversational` с $\gamma = 0.5$.

*Реализация: `detectContext()` в `src/lib/autotune.ts:212–296`.*

**Выбор параметров.** Для каждого контекста существует базовый профиль $\theta_c$. При низкой уверенности ($\gamma < 0.6$) профиль интерполируется с базовым сбалансированным профилем:

$$\theta = (1 - (1 - \gamma)) \cdot \theta_{c^*} + (1 - \gamma) \cdot \theta_{\text{balanced}}$$

Линейная интерполяция реализована в `blendParams()`.

**Адаптация по длине разговора.** Для истории длиннее 10 сообщений применяется возрастание штрафа за повторяемость:

$$\Delta\rho = \min((|H| - 10) \times 0.01, 0.15)$$
$$\rho \leftarrow \rho + \Delta\rho, \quad f \leftarrow f + 0.5 \cdot \Delta\rho$$

**Ограничения.** Все параметры зажимаются в допустимых пределах API (см. реализацию `applyBounds()`).

(Таблицы профилей и детекторов сохранены в кодовой базе.)

### 3.3 Онлайн петля обратной связи

... (раздел подробно описывает EMA-подход, эвристики и применение корректировок — см. реализацию `src/lib/autotune-feedback.ts`)

### 3.4 Parseltongue: Искажение ввода для оценки устойчивости

... (раздел сохраняет формализм триггеров, техники трансформации и управление интенсивностью; подробности в `src/lib/parseltongue.ts`)

### 3.5 Semantic Transformation Modules (STM): Нормализация вывода

... (описание модулей `hedge_reducer`, `direct_mode`, `casual_mode` и их назначение; реализация в `src/stm/modules.ts`)

### 3.6 ULTRAPLINIAN: Мульти-модельная сравнительная оценка безопасности

... (описание уровней моделей, формирования подсказок GODMODE и Depth Directive, параллельной гонки и схемы оценки ответов — подробности и формулы сохранены в коде `api/lib/ultraplinian.ts`)

### 3.7 Сбор набора данных для открытых исследований по безопасности

Система поддерживает опциональный per-request сбор данных для формирования открытого набора исследований. При установке `contribute_to_dataset: true` записываются:

- Пользовательские сообщения и ответы моделей (системные промпты исключаются)
- Параметры AutoTune и оценка контекста
- Обнаруженные триггеры Parseltongue, применённая техника и количество трансформаций
- Применённые STM-модули
- Метаданные гонки ULTRAPLINIAN: уровень, опрошенные модели, победитель, все оценки и длительности
- Последующие рейтинги обратной связи (связанные по ID записи)

Гарантии приватности: ключи API, IP-адреса и токены аутентификации никогда не сохраняются. Хранение — в памяти с лимитом 10,000 записей (FIFO). Экспорт доступен в форматах JSON/JSONL (совместимый с HuggingFace Datasets).

### 3.8 ZDR: Операционные метаданные с приоритетом приватности

Ключевая задача при эмпирических исследованиях безопасности — воспроизводимость: нужно не только знать *что* делает система, но и *как* её используют, какие инструменты включают исследователи и какие режимы отказов возникают. G0DM0D3 решает это трёхуровневой архитектурой сбора данных с гарантией приватности на уровне схемы.

(Детали реализации Tier 1/2/3, буферов, автопубликации и агрегированных статистик сохранены в `api/lib/metadata.ts`, `src/lib/telemetry.ts`, `api/lib/hf-publisher.ts`.)
The REST API exposes the following endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/autotune/analyze` | POST | Context detection + parameter selection |
| `/v1/parseltongue/encode` | POST | Trigger detection + obfuscation |
| `/v1/parseltongue/detect` | POST | Trigger detection only |
| `/v1/transform` | POST | STM output transformation |
| `/v1/chat/completions` | POST | Single-model pipeline (AutoTune → Parseltongue → Inference → STM) |
| `/v1/ultraplinian/completions` | POST | Full ULTRAPLINIAN multi-model pipeline |
| `/v1/feedback` | POST | Submit binary rating for a response |
| `/v1/dataset/export` | GET | Export collected dataset (JSON/JSONL) |
| `/v1/metadata/events` | GET | Query raw metadata events (with filtering) |
| `/v1/metadata/stats` | GET | Aggregated operational statistics |
| `/v1/health` | GET | Health check |

The `/v1/chat/completions` endpoint defaults to GODMODE system prompt ON, Parseltongue ON, and STM (hedge\_reducer + direct\_mode) ON. Callers provide their own OpenRouter API key, avoiding inference cost subsidization.

### 4.3 Deployment

A Dockerfile is provided for HuggingFace Spaces deployment (port 7860). The container runs `tsx api/server.ts` directly.

### 4.4 Lines of Code

| Component | File | Lines |
|-----------|------|-------|
| AutoTune engine | `src/lib/autotune.ts` | 639 |
| Feedback loop | `src/lib/autotune-feedback.ts` | ~200 |
| Parseltongue engine | `src/lib/parseltongue.ts` | 433 |
| STM modules | `src/stm/modules.ts` | 154 |
| ULTRAPLINIAN engine | `api/lib/ultraplinian.ts` | 360 |
| Dataset collection | `api/lib/dataset.ts` | 162 |
| ZDR metadata tracker | `api/lib/metadata.ts` | ~400 |
| Client telemetry beacon | `src/lib/telemetry.ts` | ~185 |
| HuggingFace auto-publisher | `api/lib/hf-publisher.ts` | ~275 |
| API server + routes | `api/server.ts`, `api/routes/*.ts` | ~500 |
| **Total (engines + API + telemetry)** | | **~3,310** |

---

## 5. Experiments

We evaluate all five G0DM0D3 modules through computational experiments. All evaluation scripts are reproducible and included in the repository at `research/eval_*.ts`. Experiments run on the actual engine code — no simulation or reimplementation.

### 5.1 AutoTune Context Classification

**Setup.** We constructed a labeled dataset of 150 messages: 30 per context type (code, creative, analytical, conversational, chaotic), stratified by difficulty (15 easy, 10 medium, 5 hard). Easy cases contain explicit keyword matches; hard cases are ambiguous messages that could plausibly belong to multiple categories. Each message is classified using `computeAutoTuneParams()` in adaptive mode with empty conversation history.

*Evaluation script: `research/eval_autotune_classification.ts`*

**Table 3: AutoTune Per-Class Classification Metrics (n=150)**

| Context Type | Precision | Recall | F1 | Support |
|-------------|-----------|--------|----|---------|
| code | 95.7% | 73.3% | 83.0% | 30 |
| creative | 95.8% | 76.7% | 85.2% | 30 |
| analytical | 92.9% | 86.7% | 89.7% | 30 |
| conversational | 80.6% | 96.7% | 87.9% | 30 |
| chaotic | 66.7% | 86.7% | 75.4% | 30 |
| **Macro average** | **86.3%** | **84.0%** | **84.2%** | **150** |

**Overall accuracy: 84.0% (126/150), 95% bootstrap CI: [78.0%, 89.3%].**

**Table 3a: Baseline Comparison**

| Classifier | Accuracy | 95% CI | Macro F1 |
|-----------|----------|--------|----------|
| **AutoTune (proposed)** | **84.0%** | **[78.0, 89.3]** | **84.2%** |
| Keyword count (flat, no weighting) | 78.7% | [72.0, 84.7] | 80.0% |
| Length heuristic | 25.3% | [18.7, 32.7] | 21.1% |
| Random (uniform, n=100 runs) | 20.4% | [19.8, 21.1] | 20.4% |
| Majority class | 20.0% | [14.0, 26.7] | 6.7% |

AutoTune improves over the strongest baseline (flat keyword counting without the 3× message weighting) by +5.3 percentage points absolute (+6.8% relative). McNemar's test yields chi-squared=3.06, p=0.08, indicating the improvement is suggestive but not statistically significant at the alpha=0.05 level (n=150). The effect size for this improvement is Cohen's h=0.15 (small effect), computed from the proportion comparison (0.840 vs. 0.787). A post-hoc power analysis indicates that the current sample size provides approximately 45% power to detect this effect at alpha=0.05; achieving 80% power would require approximately n=350 messages per condition (see Section 6.3 for detailed discussion of statistical power limitations). A larger test set would be needed to confirm significance. The per-class analysis reveals that the 3x message weighting particularly helps conversational classification (+20.5 F1 pp over flat keywords) but hurts chaotic classification (-13.9 F1 pp) by amplifying the chaotic attractor effect.

*Baseline evaluation script: `research/eval_baselines.ts`*

**Table 4: Confusion Matrix**

| Expected \ Predicted | code | creative | analytical | conversational | chaotic |
|---------------------|------|----------|------------|----------------|---------|
| code | **22** | 0 | 2 | 1 | 5 |
| creative | 0 | **23** | 0 | 2 | 5 |
| analytical | 1 | 1 | **26** | 0 | 2 |
| conversational | 0 | 0 | 0 | **29** | 1 |
| chaotic | 0 | 0 | 0 | 4 | **26** |

**Accuracy by difficulty:** Easy: 96.0% (72/75), Medium: 88.0% (44/50), Hard: 40.0% (10/25).

**Key findings:**

1. **Chaotic is an attractor class.** The chaotic context type has 86.7% recall but only 66.7% precision (13 false positives). Analysis of misclassifications reveals that the `break`, `destroy`, and punctuation patterns in the chaotic regex set match unintended inputs (e.g., "Implement a linked list with insert and **delete** methods" triggers the chaotic `destroy/break` pattern via the word "delete"). This is the primary source of classification error.

2. **Conversational has high recall but lower precision** (96.7% recall, 80.6% precision). The short-message pattern `/^.{0,30}$/` correctly captures most conversational inputs but also absorbs genuinely ambiguous short messages.

3. **Confidence is anti-calibrated.** Average confidence for correct predictions (65.2%) is *lower* than for incorrect predictions (76.4%), a separation of −11.2 percentage points. This occurs because the chaotic category's aggressive patterns produce high-confidence scores even on misclassified inputs. This suggests confidence should not be used for thresholding without recalibration.

4. **Hard cases expose inter-class boundaries.** At 40% accuracy, hard cases reveal that the regex approach struggles with messages lacking explicit keywords (e.g., "What is the CAP theorem?" has no code-specific keyword despite being a code/CS question).

### 5.2 Feedback Loop Convergence

**Setup.** We simulate 5 synthetic users, each with defined preferred and disliked parameter vectors for a specific context type. Each user generates alternating positive (preferred params, rating=+1) and negative (disliked params, rating=-1) feedback records. We measure convergence of the adjusted parameter vector toward the user's preferred parameters using normalized L2 distance across all 6 parameter dimensions.

*Evaluation script: `research/eval_feedback_convergence.ts`*

**Table 5: Convergence Results (50 ratings, 0% noise)**

| User Profile | Context | Initial Distance | Final Distance | Improvement | Cold Start Step |
|-------------|---------|-----------------|---------------|-------------|----------------|
| CodePrecisionist | code | 0.186 | 0.108 | 42.1% | 3 |
| CreativeWriter | creative | 0.222 | 0.138 | 37.9% | 3 |
| DataAnalyst | analytical | 0.105 | 0.041 | 61.5% | 3 |
| CasualChatter | conversational | 0.042 | 0.026 | 38.2% | 3 |
| ChaosAgent | chaotic | 0.327 | 0.232 | 29.2% | 3 |

**Convergence speed.** For 4 of 5 profiles, 50% of maximum improvement is reached at step 12, 75% at step 16, and 90% at step 19. The CasualChatter profile converges faster (50% at step 6, 90% at step 9) because its preferred parameters are closer to the neutral initialization.

**Table 6: Noise Robustness (CodePrecisionist, 50 ratings, averaged over 5 runs)**

| Noise Rate | Final Distance to Preferred | Improvement |
|-----------|---------------------------|-------------|
| 0% | 0.108 | 42.1% |
| 10% | 0.128 | 31.2% |
| 20% | 0.132 | 29.1% |
| 30% | 0.149 | 19.8% |
| 40% | 0.170 | 9.0% |
| 50% | 0.191 | −2.3% |

The system degrades gracefully: at 20% noise (1 in 5 ratings flipped), it still achieves 29.1% improvement. At 50% noise (random ratings), the system correctly produces near-zero net adjustment (−2.3%), confirming that uniform noise cancels out as expected.

**Weight scaling.** Learned adjustments are inactive for the first 2 samples (cold start). Weight scales linearly: 8% at 3 samples, 25% at 10, 38% at 15, capping at 50% from 20 samples onward, exactly matching the design specification.

### 5.3 STM Precision and Recall

**Setup.** We construct 77 test cases across all three STM modules: 26 for hedge\_reducer (16 positive, 10 negative), 21 for direct\_mode (11 positive, 10 negative), and 30 for casual\_mode (20 positive, 10 negative). Positive cases contain known target patterns; negative cases contain text that should not be modified.

*Evaluation script: `research/eval_stm_precision.ts`*

**Table 7: STM Module Precision and Recall**

| Module | Precision | Recall | F1 | Accuracy | Test Cases |
|--------|-----------|--------|----|----------|------------|
| hedge\_reducer | 100.0% | 100.0% | 100.0% | 100.0% | 26 |
| direct\_mode | 100.0% | 100.0% | 100.0% | 100.0% | 21 |
| casual\_mode | 100.0% | 100.0% | 100.0% | 100.0% | 30 |
| **Macro average** | **100.0%** | **100.0%** | **100.0%** | **100.0%** | **77** |

**Pipeline composition.** When all three modules are applied sequentially to text containing hedges, preambles, and formal language, the pipeline achieves 29.5–48.6% character reduction while preserving semantic content. Example:

> **Input** (146 chars): "Sure, I think the approach is good. However, we should utilize the existing caching layer. Furthermore, it seems like the performance is adequate."
>
> **Output** (103 chars): "The approach is good. But, we should use the existing caching layer. Also, the performance is adequate."

**Caveats.** The 100% accuracy reflects the deterministic nature of regex matching: our test cases were constructed from the exact patterns in the code. These results confirm correctness of the pattern implementations, but do not measure coverage against real-world model outputs, which may contain hedging variants not captured by the 11+10+22 patterns (e.g., "I'm not entirely sure, but..." is not matched by any hedge\_reducer pattern).

### 5.4 ULTRAPLINIAN Scoring Function Calibration

**Setup.** We construct synthetic responses with controlled properties (length, structure, refusal count, preamble presence, query relevance) and validate that the scoring function produces expected behaviors: monotonicity, quality-tier discrimination, and interpretable component contributions.

*Evaluation script: `research/eval_scoring_calibration.ts`*

**Length monotonicity: CONFIRMED.** Scores increase monotonically from 40 (10 chars) to 65 (1,000+ chars), saturating at 1,000 characters as designed.

**Table 8: Quality Tier Discrimination**

| Quality Tier | Configuration | Score |
|-------------|--------------|-------|
| EXCELLENT | 2000 chars, 4 headers, 8 list items, 2 code blocks, direct, relevant | 98 |
| GOOD | 800 chars, 2 headers, 3 list items, 1 code block, direct, relevant | 89 |
| MEDIOCRE | 300 chars, 1 header, preamble, relevant | 57 |
| POOR | 200 chars, no structure, preamble, 1 refusal, relevant | 43 |
| TERRIBLE | 150 chars, no structure, preamble, 3 refusals, irrelevant | 16 |

**Strict ordering: YES.** All five quality tiers are correctly ordered (98 > 89 > 57 > 43 > 16). Score spread: 82 points, providing strong discrimination across quality levels.

**Table 9: Component Contribution Analysis (baseline score: 92)**

| Degradation | Score | Delta | % of Baseline |
|------------|-------|-------|---------------|
| Remove length (→ 50 chars) | 49 | −43 | 46.7% |
| Remove structure | 73 | −19 | 20.7% |
| Add 3 refusals | 68 | −24 | 26.1% |
| Add preamble | 85 | −7 | 7.6% |
| Remove relevance | 82 | −10 | 10.9% |

**Finding: Length dominates the scoring function.** Reducing length from 800 to 50 characters causes a 43-point drop (46.7% of baseline), more than any other single degradation. This means the scoring function heavily rewards verbose responses. The anti-refusal component is the second largest contributor at 26.1%, followed by structure at 20.7%. Directness (preamble penalty) contributes only 7.6%, suggesting its 15-point allocation has limited discriminative power due to the binary nature (15 or 8, a 7-point swing).

**Edge cases.** Empty strings and strings shorter than 10 characters correctly receive a score of 0. The function handles empty queries gracefully (relevance defaults to 0.5).

### 5.5 Parseltongue Transformation Analysis

**Setup.** We evaluate trigger detection accuracy, per-technique transformation properties across all 18 technique × intensity configurations, and cross-technique comparison.

*Evaluation script: `research/eval_parseltongue_analysis.ts`*

**Trigger detection: 100% recall.** All 54 default triggers (53 unique; "exploit" appears in two categories) are correctly detected. Detection is position-invariant (start, middle, end of sentence), punctuation-resilient, and case-insensitive, all confirmed at 100% across 6 positional variations × 5 sample triggers.

**Table 10: Per-Technique Transformation Properties (medium intensity, averaged over 5 runs)**

| Technique | Avg Edit Distance | Non-ASCII Chars | Zero-Width Chars | Length Change | Unique Variants |
|-----------|------------------|-----------------|-----------------|-------------|----------------|
| leetspeak | 8.6 | 2.4 | 0 | +2.6 | 10/10 |
| unicode | 6.0 | 6.0 | 0 | 0 | 10/10 |
| zwj | 6.0 | 6.0 | 6.0 | +6.0 | 10/10 |
| mixedcase | 5.0 | 0 | 0 | 0 | 10/10 |
| phonetic | 3.0 | 0 | 0 | 0 | 1/10 |
| random | 6.6 | 1.8 | 0 | +1.0 | 10/10 |

**Key findings:**

1. **Leetspeak produces the highest edit distance** (8.6 at medium, 14.2 at heavy), making it the most disruptive to the original text. It also introduces multi-character substitutions (e.g., `|V|` for `m`), increasing text length.

2. **Unicode is length-preserving.** Homoglyph substitutions replace characters one-to-one, maintaining exact string length while introducing 6.0 non-ASCII characters at medium intensity.

3. **ZWJ is detectable.** Zero-width characters are trivially detectable by scanning for Unicode codepoints U+200B–U+FEFF. This technique's security properties rely on the target system not performing Unicode normalization.

4. **Phonetic is deterministic.** Only 1 unique variant is produced across 10 runs because the substitution rules are fixed (e.g., `ck→k`, `c→k`, `x→ks`). This makes phonetic transformations fully predictable, unlike the randomized techniques.

5. **Intensity scaling works as designed.** Edit distance increases monotonically from light to heavy across all techniques: leetspeak (2.6 → 8.6 → 14.2), unicode (2.0 → 6.0 → 11.0), mixedcase (2.0 → 5.0 → 6.6).

### 5.6 Future Evaluation Directions

The experiments above validate module correctness and internal consistency. Several evaluations remain that require external resources:

1. **Live model evaluation.** Testing Parseltongue obfuscation effectiveness and ULTRAPLINIAN multi-model racing requires API access to multiple LLM providers. We plan to conduct these evaluations via OpenRouter as part of the research preview deployment.

2. **Human preference evaluation.** Validating whether the ULTRAPLINIAN scoring function correlates with human quality judgments requires annotator studies. We plan to collect these via the opt-in dataset collection system.

3. **AutoTune parameter quality.** Measuring whether context-adaptive parameters produce better model outputs than static defaults requires paired generation experiments across multiple models.

4. **STM coverage on real outputs.** Testing STM modules against real-world model outputs (rather than constructed test cases) would reveal hedge/preamble variants not captured by current patterns.

### 5.7 Operational Metadata Analysis

The three-tier telemetry architecture described in Section 3.8 provides infrastructure for longitudinal analysis of how researchers use inference-time steering primitives. While we do not yet have sufficient deployed usage data to report empirical findings, we describe the analytic capabilities this infrastructure enables and note that this represents *infrastructure for future analysis* rather than completed analysis.

**Steering primitive usage patterns.** The ZDR metadata tracker records which pipeline features are activated on every request (godmode, autotune, parseltongue, STM modules, strategy). The `MetadataStats.pipeline` object aggregates these into usage rates (e.g., `godmode_rate`, `autotune_rate`, `parseltongue_rate`) and per-module/per-strategy counts. Over time, this enables analysis of questions such as: Which combinations of steering primitives do researchers activate most frequently? Do usage patterns differ between standard and ULTRAPLINIAN modes? Which STM modules are most commonly paired?

**Model performance and failure analysis.** Per-model metadata (`MetadataStats.models.by_model`) tracks query counts, win rates, average scores, average durations, and success rates across all ULTRAPLINIAN races. Error categorization (`MetadataStats.errors.by_type`) classifies failures into `timeout`, `rate_limit`, `auth`, `model_error`, `empty`, `early_exit`, and `unknown` types. These aggregates enable cross-provider reliability analysis and identification of systematic failure modes without requiring access to individual request content.

**Latency distributions.** The metadata system computes latency percentiles (p50, p95, p99) across all requests. For safety research, latency distributions are relevant because they affect the practicality of multi-model comparison: if certain models consistently time out under ULTRAPLINIAN's 90-second deadline, their safety behaviors are systematically underrepresented in race outcomes.

**Context detection distributions.** Aggregated context detection counts (`MetadataStats.contexts`) reveal how AutoTune classifies real-world research queries. This provides an empirical check on whether the five context types (code, creative, analytical, conversational, chaotic) adequately cover the distribution of safety evaluation queries, or whether additional context types are needed.

**Reproducibility support.** The combination of pipeline configuration flags, model selections, context detections, and scoring outcomes — all recorded without message content — provides a structural fingerprint of each evaluation session. Researchers can use exported metadata to verify that their evaluation protocol (e.g., "ULTRAPLINIAN full tier with autotune and parseltongue enabled") was consistently applied across a study, supporting claims of methodological consistency in safety evaluations.

**Limitations of metadata-only analysis.** Because Tiers 1 and 2 record no message content, the metadata system cannot answer questions about the *quality* or *safety relevance* of individual interactions. Correlating metadata patterns with safety-relevant outcomes requires Tier 3 (opt-in dataset collection) or external annotation. The metadata system is best understood as providing the operational context within which safety-relevant findings occur, rather than the findings themselves.

---

## 6. Discussion

### 6.1 Design Decisions and Trade-offs for Safety Research

**Transparency through regex-based detection.** AutoTune uses 20 hand-crafted regex patterns rather than a trained text classifier. For safety research, this transparency is a feature: every classification decision can be traced to specific pattern matches, enabling researchers to understand exactly why a particular context was detected and how it affected downstream safety evaluation. Our evaluation (Section 5.1) shows this achieves 84.0% accuracy (macro F1: 84.2%), with the chaotic attractor problem accounting for 13 of 24 misclassifications.

**Interpretable scoring for safety comparison.** ULTRAPLINIAN's 100-point scoring function uses fixed, interpretable weights rather than a learned preference model. For cross-model safety comparison, this interpretability is valuable: researchers can examine individual axis scores (particularly anti-refusal and directness) to understand *how* models differ in their safety behaviors, not just *that* they differ. Our calibration experiments (Section 5.4) reveal that length contributes 46.7% of the effective score range — a finding that suggests reweighting toward safety-relevant axes for alignment-focused evaluations.

**Lightweight adaptation for iterative evaluation.** The feedback loop uses simple EMA rather than Bayesian optimization or contextual bandits. For safety evaluation, the key property is that researchers can iteratively converge on parameter configurations that reveal specific safety behaviors — the 29–62% improvement range (Section 5.2) is sufficient for practical evaluation protocols.

**In-memory storage.** Both the feedback loop and dataset collection use in-memory storage. This is appropriate for a research preview but means evaluation state is lost on server restart. The code documents this limitation explicitly (`api/lib/dataset.ts:82–83`: "For a research preview, in-memory is fine. For production, swap with a persistent store").

### 6.2 Limitations

1. **Chaotic attractor problem.** The chaotic context type acts as an attractor, achieving only 66.7% precision due to 13 false positives (Section 5.1). Words like "delete," "break," and "destroy" — common in legitimate safety evaluation contexts — trigger the chaotic regex patterns. This could cause safety evaluations to run under inappropriate parameter configurations.

2. **Confidence anti-calibration.** The system's confidence scores are inversely correlated with correctness: incorrect predictions average 76.4% confidence vs. 65.2% for correct predictions (Section 5.1). Safety researchers should not rely on confidence for evaluation gating without post-hoc calibration.

3. **Length bias in scoring.** The scoring function's effective weight on length (46.7% of the score range, Section 5.4) means it systematically prefers verbose responses. For safety evaluation, this may not be the right objective — a concise refusal can be more informative than a verbose response. Researchers may want to reweight toward the anti-refusal and directness axes for alignment-focused evaluations.

4. **Limited safety-domain context coverage.** The 20 regex patterns cover common conversational contexts but miss safety-specific domains (e.g., medical, legal, weapons, CBRN). Hard-case accuracy of 40% (Section 5.1) confirms that safety-relevant messages lacking explicit keywords may be misclassified.

5. **Feedback loop cold start.** The system requires `MIN_SAMPLES_TO_APPLY = 3` ratings before adjustments take effect. Safety researchers running short evaluation sessions may not benefit from parameter adaptation.

6. **STM pattern coverage.** While the modules achieve 100% precision/recall on our test set (Section 5.3), real-world model outputs may contain hedging variants not captured by the current 43 patterns. Safety evaluation pipelines should not rely on STM alone for output normalization.

7. **Single-provider dependency.** All model queries route through OpenRouter. Availability, pricing, and rate limits are controlled by a third party, which may limit reproducibility of cross-model safety comparisons.

8. **Parseltongue determinism.** The phonetic technique produces only 1 unique variant per word (Section 5.5, Table 10), making it fully predictable and thus less useful for robustness evaluation. Stochastic techniques (leetspeak, unicode, random) are preferable for safety testing that requires diversity of perturbations.

9. **No effectiveness claims.** We make no claims about the effectiveness of Parseltongue perturbations or GODMODE prompting against any specific model's safety training. The framework provides the evaluation infrastructure; effectiveness studies require controlled experiments with appropriate statistical power, pre-registered hypotheses, and human-subject protocols that are beyond the scope of this paper. Specifically, we do not claim that Parseltongue perturbations bypass any model's safety filters, that GODMODE prompting increases compliance rates, or that AutoTune parameter adaptation produces measurably better outputs by any external quality metric. These are all empirical questions that remain open.

### 6.3 Threats to Validity

We identify threats to the validity of our experimental findings organized along four standard dimensions.

**Internal validity.** The primary threat to internal validity is that all test sets (Sections 5.1, 5.3, 5.4, 5.5) were constructed by the authors of the system. This creates a risk of confirmation bias: test cases may inadvertently reflect the patterns the system was designed to handle, leading to inflated performance estimates. The STM evaluation (Section 5.3) is particularly susceptible — the 100% precision/recall reflects that test cases were constructed from the exact regex patterns in the code. The feedback loop evaluation (Section 5.2) uses synthetic users with known preference vectors, which may not reflect the noise characteristics and inconsistency of real human evaluators. To partially mitigate these concerns, we included adversarial "hard cases" in the AutoTune evaluation (25 ambiguous messages), which revealed substantially lower accuracy (40%), and negative test cases in the STM evaluation (30 cases designed to not trigger transformations).

**External validity.** No component has been evaluated with real users or on real safety evaluation tasks. The AutoTune classifier was tested on author-constructed messages, not messages drawn from actual safety research sessions. The feedback loop was tested with synthetic user profiles, not human researchers with genuine evaluation objectives. The Parseltongue trigger detection was tested for recall but not for effectiveness at evading any model's safety filters — which is the ultimate research question the tool is designed to help answer. Generalizability to the diverse contexts, writing styles, and evaluation goals of the broader safety research community remains unestablished.

**Construct validity.** Several of our evaluation metrics may not measure the constructs they are intended to capture. The ULTRAPLINIAN scoring function's 100-point composite metric is presented as measuring response "quality," but its heavy weighting toward length (46.7% of effective score range) and anti-refusal (26.1%) means it operationalizes "quality" in a specific way that may not align with safety researchers' actual preferences. AutoTune's "accuracy" metric treats all five context types as equally important, but in practice safety researchers may care more about correctly classifying certain context types (e.g., correctly identifying analytical queries to avoid inappropriately high temperature settings). The feedback loop's "convergence" metric (normalized L2 distance to a known preferred vector) measures parameter movement toward a target, but does not validate that the target parameters actually produce better model outputs.

**Statistical power.** The AutoTune classification experiment (Section 5.1) uses n=150 test messages (30 per class). The McNemar's test comparing AutoTune to the flat keyword baseline yields p=0.08, which does not reach conventional significance (alpha=0.05). A post-hoc power analysis indicates that with the observed effect size (5.3 percentage point improvement, corresponding to Cohen's h=0.15 for a proportion comparison), achieving 80% power at alpha=0.05 would require approximately n=350 test messages per condition. The current sample size provides approximately 45% power to detect the observed effect, meaning there is a substantial probability that a true improvement of this magnitude would not be detected. The 95% bootstrap confidence interval for accuracy ([78.0%, 89.3%]) spans 11.3 percentage points, further indicating limited precision. We recommend that future evaluations use at least n=300 messages with stratified sampling across difficulty levels to achieve adequate statistical power.

### 6.4 Motivation: Why Inference-Time Safety Evaluation Tools Matter for Alignment

A central challenge in AI alignment is understanding and measuring the robustness of safety training. Current approaches to safety evaluation often require white-box access (gradient-based attacks), expensive training pipelines (adversarial training), or rely on manually crafted jailbreak prompts that become obsolete as models are patched. G0DM0D3 addresses a gap in the safety researcher's toolkit: **systematic, reproducible, black-box robustness evaluation** that works with any model behind a standard API.

The Parseltongue module and GODMODE system prompt are designed to probe the boundaries of LLM safety training — specifically, to study whether character-level perturbations and prompt framing can affect model compliance, and to what degree safety training generalizes across input representations. This connects directly to the "mismatched generalization" failure mode identified by Wei et al. (2023): safety training may not cover all the input formats that capability training handles.

We believe that open-source safety evaluation tools serve the alignment community better than closed ones. When researchers publish robustness probes, model providers can strengthen defenses; when probes remain private, the asymmetry favors attackers. This "full disclosure" philosophy follows established norms in computer security research.

The three-tier data collection architecture (Section 3.8) embodies a privacy-by-construction approach: the always-on Tiers 1 and 2 capture only structural metadata through schemas that have no fields for message content or PII, while Tier 3 (opt-in dataset collection) records messages and responses only with explicit caller consent. This layered design enables longitudinal analysis of framework usage patterns (via Tiers 1–2) without requiring any trust that PII scrubbing will work correctly — there is simply no PII to scrub. Researchers who enable Tier 3 data collection should ensure they have appropriate IRB approval or equivalent ethical oversight for studies involving human-generated prompts (see Section 6.5 for detailed ethical considerations).

### 6.5 Ethical Considerations

**Three-tier data collection and privacy guarantees.** G0DM0D3 implements a three-tier data collection architecture (Section 3.8) with explicit, verifiable privacy guarantees at each tier. We enumerate these guarantees here for ethical review:

*Tier 1 (ZDR Metadata, always-on):* Records only structural metadata (timestamps, endpoints, model names, scores, latencies, pipeline flags, error types). The `MetadataEvent` TypeScript interface contains zero fields for message content, prompts, responses, API keys, IP addresses, or any PII. This is verifiable by inspection of `api/lib/metadata.ts:31–88`.

*Tier 2 (Client Telemetry Beacon, always-on):* Records structural metadata from the client side (model, latency, pipeline configuration, context type). The `ChatTelemetryData` interface contains zero fields for message content or PII. This is verifiable by inspection of `src/lib/telemetry.ts:35–74`. Events are sent to a Cloudflare Pages proxy; no direct connection to HuggingFace is made from the client.

*Tier 3 (Dataset Collection, opt-in only):* Records messages and responses, but only when the caller explicitly sets `contribute_to_dataset: true`. Even at this tier, the `DatasetEntry` interface has no fields for API keys, IP addresses, or authentication tokens. This is verifiable by inspection of `api/lib/dataset.ts:29–81`.

The always-on nature of Tiers 1 and 2 means users interacting with a G0DM0D3 deployment generate metadata events without explicit per-request consent. We consider this ethically acceptable because: (a) no message content or PII is captured, (b) the metadata collected is equivalent in sensitivity to standard web server access logs (timestamps, endpoints, response codes, latencies), and (c) the metadata schema is fully open-source and inspectable. Deployments should nonetheless include a privacy notice informing users about metadata collection, consistent with standard web application practices.

**IRB and ethics review.** Studies that use G0DM0D3 to collect Tier 3 (opt-in) data involving human participants — particularly studies where participants interact with the system and their messages are recorded — should undergo IRB review or equivalent institutional ethics review. The opt-in mechanism (`contribute_to_dataset: true`) provides a technical consent signal but does not by itself constitute informed consent under most human-subjects research frameworks. Researchers should ensure that participants are informed about: what data is collected, how it will be stored and published, that published data may be publicly accessible on HuggingFace, and that deletion is available via the API (`DELETE /v1/dataset/:id`).

**Responsible disclosure.** Researchers who discover model vulnerabilities using G0DM0D3 should follow responsible disclosure practices before publishing findings. We recommend: (1) notifying the affected model provider with a detailed report at least 90 days before public disclosure; (2) providing the model provider with the specific Parseltongue technique, intensity, and trigger configuration that produced the finding; (3) working with the provider to validate the finding and develop mitigations; and (4) publishing the methodology (perturbation technique, parameter configuration) rather than specific prompt payloads, following the security research norm of disclosing the vulnerability class rather than a weaponized exploit.

**Dual-use tension and mitigation.** G0DM0D3 exists in the inherent tension between security research and potential misuse. The Parseltongue module provides systematic character-level perturbation capabilities; the GODMODE system prompt applies compliance-oriented framing; the ULTRAPLINIAN scoring function explicitly rewards anti-refusal behavior. Each of these could be used to probe model safety boundaries for research purposes or to circumvent safety measures for harmful purposes. Our mitigation strategy rests on four pillars: (1) *no novelty* — all techniques are documented in prior work (leetspeak, Unicode homoglyphs, zero-width characters, prompt framing) and G0DM0D3 systematizes rather than invents them; (2) *full transparency* — the complete system is open-source, enabling model providers to build defenses against these exact patterns; (3) *no effectiveness claims* — we deliberately avoid reporting success rates against any specific model's safety filters, to prevent providing a "menu" of working attacks; and (4) *configurable objectives* — the ULTRAPLINIAN scoring axes can be reconfigured by safety-oriented researchers (e.g., inverting the anti-refusal axis to reward refusal behavior).

---

### 6.6 Broader Impact Statement

**Potential benefits for AI safety.** G0DM0D3 provides the alignment research community with a modular, open-source toolkit for studying LLM robustness at inference time. Specific contributions to safety research include: (1) systematic evaluation of how sampling parameters interact with model safety behaviors, an underexplored area; (2) reproducible character-level robustness probes that can be used to audit model safety across providers; (3) cross-model safety behavior comparison via ULTRAPLINIAN's multi-model racing; (4) an open dataset collection system that could contribute to shared safety evaluation benchmarks; and (5) a three-tier privacy-first telemetry architecture (Section 3.8) that enables longitudinal analysis of how safety evaluation tools are used in practice, with PII exclusion enforced by construction.

The AutoTune feedback loop demonstrates that inference-time parameter adaptation can meaningfully shift model behavior without weight access — a finding with implications for both safety evaluation (adapting probes to discover specific failure modes) and safety improvement (adapting parameters to reduce harmful outputs).

**Dual-use considerations and mitigations.** The techniques implemented in G0DM0D3 — particularly Parseltongue's input perturbations and the GODMODE system prompt — are dual-use: they are designed for safety research but could be applied to circumvent safety measures for harmful purposes. We address this through several design decisions: (1) all techniques are character-level transformations already well-documented in the security literature, so this work does not introduce novel attack vectors; (2) the system is fully open-source, enabling model providers to study and defend against these exact perturbation patterns; (3) we make no claims about effectiveness against any specific content filtering system; and (4) the ULTRAPLINIAN scoring function's anti-refusal axis (25/100 points) is explicitly documented and configurable, allowing safety-oriented researchers to invert or modify it.

**Recommendations for responsible use.** We recommend that: (1) researchers deploying this system implement appropriate content filtering downstream of the pipeline; (2) the Parseltongue module be used only in controlled research settings with IRB oversight; (3) the dataset collection feature, if enabled, be accompanied by appropriate consent mechanisms; and (4) findings about model vulnerabilities discovered using this toolkit be reported to model providers through responsible disclosure channels before public release.

---

## 7. Conclusion

We have presented G0DM0D3, a modular research framework for evaluating LLM robustness and safety properties at inference time, comprising five independently composable components: context-adaptive parameter selection (AutoTune), online parameter learning from binary feedback, input perturbation for robustness testing (Parseltongue), multi-model comparative evaluation (ULTRAPLINIAN), and output normalization for safety assessment (STM). The system is implemented in approximately 3,300 lines of TypeScript, requires no model weight access, and is exposed via a REST API with a three-tier privacy-first telemetry architecture and opt-in dataset collection for open safety research.

The primary contribution is providing the AI safety research community with a modular, open-source toolkit for systematic inference-time robustness evaluation. By operating entirely through standard chat completion APIs, G0DM0D3 enables safety researchers to study any model behind an API — including proprietary models — without requiring white-box access, training data, or provider-internal tooling. The framework's modular architecture allows each evaluation component to be studied in isolation or composed into multi-stage safety assessment pipelines.

Our computational evaluation (Section 5) validates the reliability of all five components: AutoTune achieves 84.0% classification accuracy with a macro F1 of 84.2% on a 150-message benchmark (Table 3), ensuring that safety evaluations are conducted under appropriate context-specific parameter configurations. The feedback loop converges to 29–62% improvement across 5 synthetic user profiles within 19 ratings, supporting iterative safety evaluation protocols. The ULTRAPLINIAN scoring function achieves strict quality-tier ordering with 82-point discrimination, enabling meaningful cross-model safety comparisons. Parseltongue achieves 100% trigger detection across all 54 default triggers, providing a reliable foundation for character-level robustness probing.

All components are open-source, all constants and thresholds are documented (Tables 1–2, Section 3), and all evaluation scripts are included in the repository (`research/eval_*.ts`). We believe that open-source safety evaluation tools serve the alignment community by enabling both reproducible robustness research and improved model defenses. The most important directions for future work are: (1) live multi-model safety comparison using the ULTRAPLINIAN pipeline, (2) cross-provider robustness studies using Parseltongue's perturbation framework, (3) developing open safety evaluation datasets via the opt-in collection system, and (4) expanding AutoTune's context patterns to support safety-domain-specific contexts (e.g., medical, legal, financial).

---

## Reproducibility Checklist

| Item | Status |
|------|--------|
| Source code available | Yes — repository withheld for anonymous review |
| All hyperparameters documented | Yes — Tables 1–2, EMA α=0.3, MIN\_SAMPLES=3, MAX\_WEIGHT=0.5, SAMPLES\_FOR\_MAX=20, scoring weights in Section 3.6 |
| All regex patterns inspectable | Yes — hardcoded in `src/lib/autotune.ts:102–133`, `src/lib/parseltongue.ts:43–67`, `src/stm/modules.ts:29–128` |
| Scoring function fully specified | Yes — 5 components with exact formulas in Section 3.6 |
| Model list enumerated | Yes — 51 models across 5 tiers listed in `index.html` ULTRAPLINIAN_MODELS array |
| Character maps enumerated | Yes — LEET\_MAP (26 entries, 85 substitutions) in `parseltongue.ts:70–97`, UNICODE\_HOMOGLYPHS (24 entries, 72 substitutions) in `parseltongue.ts:100–125` |
| Parameter bounds documented | Yes — Table in Section 3.2 |
| Dataset schema documented | Yes — `DatasetEntry` interface in `api/lib/dataset.ts:26–78` |
| Metadata schema documented | Yes — `MetadataEvent` interface in `api/lib/metadata.ts:31–88`, `ChatTelemetryData` in `src/lib/telemetry.ts:35–74` |
| Telemetry architecture documented | Yes — three-tier design in Section 3.8, privacy guarantees verified by schema inspection |
| Auto-publish pipeline documented | Yes — `api/lib/hf-publisher.ts`, snapshot-upload-clear pattern, threshold/periodic/shutdown triggers |
| Deployment instructions | Yes — Dockerfile and API.md in repository |
| Experimental results | Yes — 5 computational experiments in `research/eval_*.ts`, results in Section 5, Tables 3–10 |
| Evaluation scripts included | Yes — `research/eval_autotune_classification.ts`, `eval_feedback_convergence.ts`, `eval_stm_precision.ts`, `eval_scoring_calibration.ts`, `eval_parseltongue_analysis.ts` |
| Training data used | **None** — system is training-free |
| Compute requirements | Minimal — TypeScript runtime, no GPU required; inference cost determined by OpenRouter pricing |
| Key dependency versions | TypeScript ^5.3, Express ^5.2.1, Next.js ^14.2, React ^18.2, Node.js 20+, tsx ^4.21 |
| Statistical reporting | Effect sizes, confidence intervals, and power analysis notes included (Sections 5.1, 6.3) |

---

## References

Ackley, D. H., Hinton, G. E., & Sejnowski, T. J. (1985). A Learning Algorithm for Boltzmann Machines. *Cognitive Science*, 9(1), 147–169.

Amodei, D., Olah, C., Steinhardt, J., Christiano, P., Schulman, J., & Mané, D. (2016). Concrete Problems in AI Safety. *arXiv:1606.06565*.

Bai, Y., Kadavath, S., Kundu, S., Askell, A., et al. (2022). Constitutional AI: Harmlessness from AI Feedback. *arXiv:2212.08073*.

Chao, P., Robey, A., Dobriban, E., Hassani, H., Pappas, G. J., & Wong, E. (2023). Jailbreaking Black Box Large Language Models in Twenty Queries. *arXiv:2310.08419*.

Chen, L., Zaharia, M., & Zou, J. (2023). FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance. *arXiv:2305.05176*.

Dathathri, S., Madotto, A., Lan, J., Hung, J., Frank, E., Molino, P., Yosinski, J., & Liu, R. (2020). Plug and Play Language Models: A Simple Approach to Controlled Text Generation. *ICLR 2020*.

Fan, A., Lewis, M., & Dauphin, Y. (2018). Hierarchical Neural Story Generation. *ACL 2018*.

Ganguli, D., Lovitt, L., Kernion, J., Askell, A., et al. (2022). Red Teaming Language Models to Reduce Harms: Methods, Scaling Behaviors, and Lessons Learned. *arXiv:2209.07858*.

Greshake, K., Abdelnabi, S., Mishra, S., Endres, C., Holz, T., & Fritz, M. (2023). Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection. *AISec 2023*.

Hendrycks, D., Carlini, N., Mazeika, M., et al. (2021). Unsolved Problems in ML Safety. *arXiv:2109.13916*.

Holtzman, A., Buys, J., Du, L., Forbes, M., & Choi, Y. (2020). The Curious Case of Neural Text Degeneration. *ICLR 2020*.

Jiang, D., Ren, X., & Lin, B. Y. (2023). LLM-Blender: Ensembling Large Language Models with Pairwise Ranking and Generative Fusion. *ACL 2023*.

Li, X., Zhang, T., Dubois, Y., Taori, R., Gulrajani, I., Guestrin, C., Liang, P., & Hashimoto, T. B. (2023). AlpacaEval: An Automatic Evaluator of Instruction-following Models. *GitHub repository*.

Liu, Y., Deng, G., Xu, Z., et al. (2024). Jailbreaking ChatGPT via Prompt Engineering: An Empirical Study. *arXiv:2305.13860*.

Mazeika, M., Phan, L., Yin, X., Zou, A., et al. (2024). HarmBench: A Standardized Evaluation Framework for Automated Red Teaming and Robust Refusal. *arXiv:2402.04249*.

Ong, I., Almahairi, A., Wu, V., Chiang, W.-L., & Stoica, I. (2024). RouteLLM: Learning to Route LLMs with Preference Data. *arXiv:2406.18665*.

Ouyang, L., Wu, J., Jiang, X., et al. (2022). Training language models to follow instructions with human feedback. *NeurIPS 2022*.

Perez, E., Huang, S., Song, F., Cai, T., Ring, R., Aslanides, J., Glaese, A., McAleese, N., & Irving, G. (2022). Red Teaming Language Models with Language Models. *EMNLP 2022*.

Qi, X., Zeng, Y., Xie, T., Chen, P.-Y., Jia, R., Mittal, P., & Henderson, P. (2024). Fine-tuning Aligned Language Models Compromises Safety, Even When Users Do Not Intend To. *arXiv:2310.03693*.

Rafailov, R., Sharma, A., Mitchell, E., Ermon, S., Manning, C. D., & Finn, C. (2023). Direct Preference Optimization: Your Language Model is Secretly a Reward Model. *NeurIPS 2023*.

Shen, X., Chen, Z., Backes, M., Shen, Y., & Zhang, Y. (2024). "Do Anything Now": Characterizing and Evaluating In-The-Wild Jailbreak Prompts on Large Language Models. *arXiv:2308.03825*.

Stiennon, N., Ouyang, L., Wu, J., Ziegler, D., Lowe, R., Voss, C., Radford, A., Amodei, D., & Christiano, P. (2020). Learning to summarize with human feedback. *NeurIPS 2020*.

Wang, J., et al. (2024). Mixture-of-Agents Enhances Large Language Model Capabilities. *arXiv:2406.04692*.

Wei, A., Haghtalab, N., & Steinhardt, J. (2023). Jailbroken: How Does LLM Safety Training Fail? *NeurIPS 2023*.

Yang, K., & Klein, D. (2021). FUDGE: Controlled Text Generation With Future Discriminators. *NAACL 2021*.

Zheng, L., Chiang, W.-L., Sheng, Y., Zhuang, S., Wu, Z., Zhuang, Y., Lin, Z., Li, Z., Li, D., Xing, E. P., Zhang, H., Gonzalez, J. E., & Stoica, I. (2024). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. *NeurIPS 2024*.

Zou, A., Wang, Z., Kolter, J. Z., & Fredrikson, M. (2023). Universal and Transferable Adversarial Attacks on Aligned Language Models. *arXiv:2307.15043*.
