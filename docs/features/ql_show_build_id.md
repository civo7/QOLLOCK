# Selected build readout ownership

The `ql_show_build_id` manifest owns the created `selected_build_info/build_info`
tree under the current native `LowerLeft`. Its settings model, source resolvers
and successful style signatures belong to the feature instance. The selected
build and shop metadata remain native data; the readout never changes them.

`citadel_hud_hero_builds.xml` supplies the hidden `SelectedBuildInfoTitle` binding.
The existing parser preserves public/private status, numeric ID formatting and
title behavior. When that binding has no usable title, the current native
`SelectedBuildOuter`/`SelectedBuildName` provides the fallback. Unresolved native
localization tokens are not displayed as titles. Missing/invalid metadata hides
the readout until the source becomes available again.

Settings hooks derive the enable/title choices. Polling observes changing native
metadata and resolves late sources with bounded retries. Current HUD and
`LowerLeft` replacements release the former created tree, including moved labels;
a new instance waits for prior asynchronous deletion. Partial construction stays
hidden. Rejected text/styles remain retryable instead of freezing a previously
committed content signature. Disable removes the tree and poll, and stopped hooks
cannot recreate UI. Hideout remains supported.

`build_id_owner_lifecycle.test.js` covers parsing and native title fallback,
reactive settings, late/replaced sources and parents, living HUD replacement,
partial construction/writes, rapid re-enable and registry cleanup. Existing preset
bridge and hideout tests retain compatibility. Native shop dialog-variable
binding and presentation require maintainer compilation/repacking and client
verification.
