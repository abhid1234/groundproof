#!/bin/sh
set -eu

# Optional network helper. This downloads the public SNLI 1.0 archive; it is not
# used by tests and was not executed in the offline development sandbox.
# SNLI labels map as entailment->supported, contradiction->contradicted,
# neutral->unsupported. Its premise/hypothesis JSONL needs adapting to the
# documented groundproof schema before `groundproof eval` can consume it.
destination="${1:-fixtures/eval/snli_1.0.zip}"
curl --fail --location --output "$destination" https://nlp.stanford.edu/projects/snli/snli_1.0.zip
printf 'Downloaded %s. Extract snli_1.0_dev.jsonl and map it with the NLI adapter.\n' "$destination"
