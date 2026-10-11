# Context7 listing and release gate

Track submission and verification in `gyral-7se.5`. The final 0.3.1 npm release and
registry-only basic/SSR starter verification are recorded in closed `gyral-b2g`.
No Context7 listing is complete until its actual ID, public URL and retrieved examples
have been verified.

## Source

Submit **https://gyral.dev/llms-full.txt** using Context7's llms.txt source. It contains
the released consumer guides, API and examples, and matches the published MCP corpus.
Indexing the entire framework repository would also include historical design decisions,
internal release recipes and work that has not shipped. The llms.txt source uses the
library ID assigned by Context7; do not assume it will be `/gyraljs/gyral`.

Context7 supports both [llms.txt submissions](https://context7.com/docs/api-reference/add-library/add-an-llmstxt-file)
and [repository parsing configuration](https://context7.com/docs/library-owners).
Repository `context7.json` configuration does not govern an llms.txt submission.

## Preflight

Run from the framework repository:

```sh
node scripts/context7.mjs preflight
```

This is read-only. It requires all nine packages to serve the snapshot's final version
as npm `latest`, with provenance present. It compares production llms-full.txt with the
committed snapshot and the actual published MCP corpus, after verifying the npm tarball's
SHA512 integrity. It saves version, source hash and registry evidence in a fresh temporary
directory, printed by the command. `--out <new-directory>` selects another evidence location.

This does not replace the [release runbook](releasing.md): registry-only starter checks
and matching website deployment must already be complete. After future releases, update
the snapshot and repeat these checks before submitting or refreshing Context7.

## Submit

Context7's [API](https://context7.com/docs/api-guide) requires an API key from its dashboard.
Supply `CONTEXT7_API_KEY` through the local secret environment; keep it out of git and chat.
The tool does not log the key and refuses to follow API redirects.

```sh
node scripts/context7.mjs submit
```

This repeats preflight immediately before the explicit external write. It submits the
public URL through `POST /api/v2/add/llmstxt`, saves the returned library ID and URL in
`submission.json`, and performs no automatic retries. Submission acceptance means that
processing was requested; it does not prove the index is ready.

Alternatively, sign in at [Add Library](https://context7.com/add-library?tab=llmstxt),
select **llms.txt**, enter the same source URL, and record the resulting ID.
If Context7 reports an existing listing, inspect its source and use that exact ID.
Do not create duplicate entries to work around an indexing or authentication failure.

## Verify and close

Once processing completes, use the actual ID returned by submission:

```sh
node scripts/context7.mjs verify --library /llmstxt/actual-returned-id
```

The command repeats release preflight, verifies that the listing page is live, retrieves
component, form and storage-driver examples from the exact library, and saves raw JSON.
It checks for code, relevant API symbols and official source citations. Processing,
redirects, missing snippets and errors fail explicitly; no fuzzy library fallback is used.

Review the saved code and source links for all three queries. Confirm the current two-call
`define()` API, form validation and `IntentRejected`, and the separate localStorage/IndexedDB
driver entries. Identify migration examples as historical; current setup must use npm,
without vendored tarballs or local file/link overrides. A smoke-check pass alone does not
prove these details. Save the reviewed evidence and actual listing URL/ID in the bead,
then close with a reason. Keep `.5` and the parent epic open until this is done.
