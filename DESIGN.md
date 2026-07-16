# groundproof design

## Thesis and name

`groundproof` is an open format and a small reference verifier for research evidence. It turns an
answer and its provider-supplied evidence into a portable receipt whose claims, cited excerpts,
independent verdicts, and cryptographic identity can travel together and be checked offline.

The name is deliberately provider-neutral: it describes evidence grounded in sources, rather than
one vendor's response type. It also belongs beside `provenant`, `truecall`, `capgrant`, and
`skillproof`: a compact noun for a zero-runtime-dependency format with a pure reference
implementation. For Parallel specifically, groundproof is a complementary verification layer for
Basis. Basis supplies unusually rich claim-level evidence; groundproof makes that evidence portable
and subjects it to a separate, reproducible check.

This is not a claim that a deterministic heuristic can decide truth. The default verifier tests
whether supplied text is consistent with and appears to support a claim. It cannot establish that
the source is authoritative, the excerpt is contextually honest, or the world is as the source says.

## Design principles

1. **A format first.** The receipt is useful without adopting a runtime, service, or provider.
2. **Deterministic and offline by default.** Identical normalized input and options produce the same
   semantic receipt and ID. Network state never silently affects a result.
3. **Independent recomputation.** Provider confidence is retained as an assertion, never reused as
   the verifier's confidence.
4. **Evidence is claim-local.** Every atomic claim owns its evidence and verdict. Answer-level scores
   are transparent aggregates, not an opaque second judgment.
5. **Honest states.** Offline source integrity is `unverified-source`, not “verified.” A fetched page
   can establish excerpt presence and reachability, but still cannot establish truth.
6. **Replaceable judgment.** Normalization, decomposition, judging, fetching, receipt creation, and
   signing meet at narrow data interfaces.

## Pipeline

```text
provider payload -> normalize -> atomic claims -> judge each evidence span
                                              -> optional source check
                 -> aggregate/calibrate -> receipt -> content hash -> optional signature
```

The pure core accepts JavaScript values and returns JavaScript values. The CLI owns files, standard
input/output, and optional HTTP. Tests exercise the core without network access.

## Unified input model

Normalization produces:

```js
{
  answer: string | object | array,
  provider: string,
  claims: [{
    path: string,                 // JSON Pointer for structured data, or prose position
    text: string,
    assertedConfidence: "low" | "medium" | "high" | null,
    evidence: [{ url, title, excerpt }]
  }],
  sources: [{ url, title, content? }],
  metadata: object
}
```

The Parallel normalizer accepts the Task API response itself or its `result.output`. It reads
`result.output.content` and `result.output.basis`. Because Basis shapes can vary between prose and
structured outputs, matching uses, in order: explicit field paths/keys, claim text, and positional
association. Basis citations expressed as URLs, citation objects, or source references are resolved
to evidence records. `reasoning` is preserved as provider metadata but is never treated as evidence.

The generic normalizer accepts `{ answer, claims?, sources[] }`. Explicit claims may include
`path`, `text`, `citations`/`evidence`, and confidence. When claims are absent, the decomposer creates
them and attaches sources whose excerpt/content is relevant; it does not invent quoted evidence.

The live adapter POSTs `{ input, processor, task_spec? }` to Task Runs, polls `/{run_id}/result`, and
passes the returned JSON unchanged to `normalizeParallel`. Fetch and sleep are injected for hermetic
tests. Only the CLI reads `PARALLEL_API_KEY`; no key or provider SDK belongs in the core. The wire
shape is a documented assumption to reconcile with current Parallel docs before production use.

## Browser and benchmark additions

`site/` is a build-free static playground. Its decomposition, normalization, text, scoring, and
verification modules are byte-identical core copies, enforced by a drift test. The browser receipt
preserves the same canonical pre-image while WebCrypto supplies asynchronous SHA-256; a parity test
proves IDs match Node. Browser signing is omitted. Presets and source text are local, with no fetch.

`fixtures/benchmark/*.json` is a reusable directory schema: ID, question, gold answer, cached
real-URL sources/excerpts, and grounded/degraded variants. The runner aggregates mean groundedness,
verdict distribution, over-confidence, and separation. The 10-item hand-curated slice is illustrative,
not official: it does not estimate factual accuracy, population calibration, source quality, or
performance on BrowseComp, FRAMES, SimpleQA, or another licensed evaluation.

## Atomic claim decomposition

Structured content is deterministic: every non-container leaf becomes one claim. Its path is an
RFC 6901 JSON Pointer and its text is rendered as `field label: value`, retaining enough field
context to make values such as `true` or `2024` meaningful. Arrays of scalar values use one claim per
element; nested records recurse.

Prose is segmented conservatively in two passes:

- split paragraphs and sentence boundaries (`.`, `?`, `!`) while protecting decimals and common
  abbreviations;
- split coordinated independent assertions on semicolons and on conjunctions only when both sides
  contain enough substantive tokens and their own verb or numeric predicate.

This avoids pretending to be a semantic parser. Explicit provider claim mappings always win. Each
generated claim has a stable path such as `/prose/0`. Decomposition is exported so a consumer can
replace it with an LLM or domain parser before verification.

## Default entailment heuristic

The default `heuristic-v1` judge implements `judge({ claim, excerpt }) -> verdict`. It is deliberately
deterministic and explainable. Text is Unicode-normalized, lowercased, punctuation-normalized, and
tokenized. A compact English stop-word set is removed for content comparisons; light suffix
normalization handles plural and common verb endings without claiming full stemming.

It computes these signals:

- **Content-token recall (35%)**: weighted fraction of claim content tokens present in the excerpt.
- **Ordered phrase coverage (20%)**: coverage of claim content bigrams found in the excerpt, with a
  unigram fallback for very short claims.
- **Entity agreement (15%)**: capitalized names/acronyms in the claim must occur in the excerpt.
- **Number/date agreement (20%)**: normalized claim numbers, percentages, currency amounts, and
  four-digit years must occur. A missing or conflicting salient number is a hard contradiction.
- **Polarity agreement (10%)**: negation near the same predicate must agree. Opposite polarity is a
  hard contradiction.

Missing signal classes are reweighted away rather than receiving free points. The verdict is:

- `supported` at score >= 0.72 with no hard contradiction;
- `partial` at score >= 0.45 with no hard contradiction;
- `unsupported` otherwise;
- `contradicted` when number/date conflict or predicate-local negation conflict is detected.

Multiple excerpts are judged individually. A claim uses its best evidence score, with a small
bounded corroboration bonus (up to 0.05) when distinct URLs independently score as supported. This
prevents a pile of weak excerpts from becoming strong evidence.

The judge interface is structural, so an LLM/NLI judge can return the same `{ score, verdict,
signals, reasons }` shape. Receipts record the judge name and version; scores from different judges
must not be presented as directly benchmark-equivalent without calibration.

## Citation integrity

Each evidence item has an integrity result:

```js
{ status: "verified" | "drifted" | "unreachable" | "unverified-source", excerptPresent, checkedAt? }
```

Offline operation never fetches. If a fixture or generic source supplies `content`, normalized exact
substring matching (then whitespace-tolerant matching) checks that the excerpt is present. Otherwise
the status is `unverified-source`. This state does not erase entailment: “the provided excerpt
supports the claim, but its presence at the URL was not checked” is useful and precise.

Network checking is explicit through an injected async fetcher or a CLI flag. A successful fetch
with the excerpt present is `verified`; a successful fetch without it is `drifted`; transport or
non-success HTTP is `unreachable`. `checkedAt` is recorded only for network checks and is excluded
from claims of deterministic reproduction. Redirect-final URLs may be metadata, not replacements
for the cited URL.

## Claim score and independent confidence

Claim groundedness begins with the best entailment score. Integrity then applies a transparent
multiplier: `verified` or excerpt-present supplied content = 1.0, `unverified-source` = 0.9,
`drifted` = 0.45, and `unreachable` = 0.7 (availability failure is weaker evidence, not proof of
falsehood). Contradiction caps the score at 0.2; no evidence is zero.

Independent confidence is derived only from the final groundedness score:

- `high`: >= 0.80
- `medium`: >= 0.55
- `low`: below 0.55

An asserted confidence is over-confident when its ordinal level exceeds the recomputed level. This
simple calibration check is intentionally legible: a Parallel `high` assertion paired with weak
evidence is flagged without claiming that a single example measures global probabilistic
calibration.

Answer groundedness is the arithmetic mean of claim scores. Each atomic claim gets equal weight so
long prose cannot hide an unsupported assertion inside a well-supported paragraph. The receipt also
reports supported/partial/unsupported/contradicted, over-confidence, and integrity counts. Consumers
can gate on a minimum overall score and/or zero unsupported claims.

## Receipt schema

The JSON envelope is `groundproof/receipt@1`:

```json
{
  "format": "groundproof/receipt@1",
  "id": "sha256:<hex>",
  "subject": { "answer": {}, "provider": "parallel" },
  "verification": {
    "judge": { "name": "groundproof-heuristic", "version": "1" },
    "network": false,
    "claims": [{
      "path": "/employees",
      "claim": "employees: 42",
      "assertedConfidence": "high",
      "evidence": [{
        "url": "https://example.test/company",
        "title": "Company",
        "excerpt": "The company employs 42 people.",
        "entailment": { "score": 0.91, "verdict": "supported", "signals": {} },
        "integrity": { "status": "unverified-source", "excerptPresent": null }
      }],
      "score": 0.82,
      "confidence": "high",
      "verdict": "supported",
      "flags": []
    }],
    "summary": { "score": 0.82, "confidence": "high", "counts": {} }
  },
  "signature": { "algorithm": "hmac-sha256", "keyId": "...", "value": "base64url..." }
}
```

`subject.answer` preserves the original semantic answer, not a display-only rendering. Evidence is
copied into the receipt so it remains offline-verifiable. Optional provider reasoning can be stored
under `subject.metadata.providerBasis`; it is not an input to independent scoring.

Validators are non-throwing and return `{ valid, errors }`, where errors contain JSON Pointer paths
and stable codes/messages. Unknown fields are allowed for forward-compatible annotations.

## Identity, canonicalization, and signatures

Canonicalization first performs JSON normalization (`JSON.parse(JSON.stringify(value))`), recursively
removes every object property named `id` or `signature`, sorts object keys lexicographically, retains
array order, and serializes compact JSON. The receipt ID is `sha256:` plus the hexadecimal SHA-256 of
those UTF-8 bytes. This follows the family convention and ensures adding a signature cannot change
identity.

Signatures cover the same canonical bytes. The reference implementation supports:

- HMAC-SHA-256 with a caller-managed secret and optional key ID;
- Ed25519 using Node's native `crypto` PEM keys, including key generation.

Verification recomputes the content ID before checking a signature. Consequently semantic tampering
fails even for unsigned receipts, while a copied/recomputed ID still fails signature verification.
Because `id` and `signature` are excluded everywhere in the tree, consumers must not place semantic
content under either key.

## CLI and gates

`groundproof verify <input>` normalizes and scores a payload; `receipt` emits the complete receipt;
`check` validates ID and an optional signature; `keygen` creates Ed25519 PEM keys; and `demo` compares
the shipped Parallel-style evidence-backed response with a naive baseline. `-` means standard input.
Human-readable output is the default for verification/demo and `--json` provides automation output.
`verify --parallel <question>` invokes the live adapter; `benchmark [dir]` prints a comparison table
or JSON for the labeled offline sample.

A verification gate fails when the score is below `--min-score` (default 0), when
`--fail-unsupported` finds unsupported/contradicted claims, or when `check` detects an invalid
receipt/ID/signature. File and schema errors use a distinct non-zero exit code from gate failures.

## Security and limitations

- Lexical support is not semantic truth. Paraphrases may score too low; copied falsehoods may score
  high. The tool must be described as a baseline verifier, not a fact checker.
- Negation scope, coreference, comparison, units, and implied arithmetic are only partially handled.
- Excerpt presence does not prove the excerpt was interpreted in context or that the publisher is
  trustworthy. Pages rendered only by JavaScript may appear drifted to a simple fetcher.
- HMAC proves possession of a shared secret, not public authorship. Ed25519 public-key distribution
  and trust remain the consumer's responsibility.
- Equal claim weighting is auditable but not a measure of claim importance. Consumers may build
  policy on top without changing the receipt's recorded base score.
- Provider confidence labels may have meanings calibrated over a population; the per-claim
  over-confidence flag is a diagnostic disagreement, not a statistical calibration study.

## Success criterion

The included demo uses the same research question and source material twice. The Parallel-shaped
answer has claim-local excerpts and should score materially higher. The naive baseline includes one
unsupported, high-confidence assertion; groundproof must identify it and the confidence mismatch.
The comparison demonstrates the intended respectful story: rich Basis-style evidence gives an
independent verifier more to work with and performs better than citation-shaped prose without
claim-level support.
