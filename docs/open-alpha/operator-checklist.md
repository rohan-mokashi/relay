# Open Alpha operator checklist

## Before publication

- [ ] Confirm the exact candidate commit is clean and `pnpm verify` passes.
- [ ] Confirm the owner has selected and approved the repository license.
- [ ] Run `pnpm alpha:bundle` and retain the emitted ZIP, `.sha256`, and JSON record together.
- [ ] Independently verify the checksum, extract the ZIP, and complete
      `node scripts/private-alpha-setup.mjs` on Windows in under ten minutes.
- [ ] Publish the repository with Issues and Discussions enabled.
- [ ] Enable GitHub private vulnerability reporting and confirm `SECURITY.md` links to it.
- [ ] Publish an immutable GitHub prerelease containing all three generated artifacts.
- [ ] Verify the release tag, artifact commit, JSON commit, and documented version agree.

## Enrollment

- [ ] Announce the Open Alpha using [recruitment-post.md](recruitment-post.md) only after the
      prerelease is downloadable.
- [ ] Review public applications for the supported Windows, Node.js 24, pnpm 11, and two-client
      path. Never ask applicants for private project details.
- [ ] Enroll at most five participants in the first batch. Expand only while no SEV-1/2 incident or
      systemic setup failure is open.
- [ ] Point enrolled participants to the exact prerelease and
      [tester-quickstart.md](../private-alpha/tester-quickstart.md).

## Evidence handling

- [ ] Accept only the numeric and boolean fields in the public result form.
- [ ] Generate a fresh random `alpha_[a-z0-9]{8,24}` reference when transcribing each accepted
      result; do not copy GitHub usernames, issue numbers, URLs, or prose into the metrics file.
- [ ] Keep `.data/alpha-observations.jsonl` local and ignored, then run
      `pnpm alpha:metrics -- .data/alpha-observations.jsonl`.
- [ ] Deduplicate one final result per enrolled participant outside the metrics dataset.
- [ ] Keep support and security evidence separate from value metrics.

## Daily and exit controls

- [ ] Triage support and incidents using
      [support-and-incidents.md](../private-alpha/support-and-incidents.md).
- [ ] Pause enrollment for suspected credential exposure, cross-principal access, silent loss,
      destructive behavior, or migration corruption.
- [ ] Compare aggregate results to [exit-scorecard.md](../private-alpha/exit-scorecard.md) without
      changing thresholds.
- [ ] Do not announce Public Beta until every value, safety, and support gate passes and the owner
      records a dated sign-off.

