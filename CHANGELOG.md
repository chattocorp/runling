# Changelog

## [0.6.0](https://github.com/chattocorp/runling/compare/v0.5.0...v0.6.0) (2026-09-07)


### Features

* add persistent column resizing ([c7346ad](https://github.com/chattocorp/runling/commit/c7346ad785b69d861b01cf0836df6dc00f5e2f5c))
* dim and disable UI while disconnected ([206bba8](https://github.com/chattocorp/runling/commit/206bba8af5c8dd2bdbb64329c93f23d159b50820))
* show live activity in recent runs ([ba5cfa5](https://github.com/chattocorp/runling/commit/ba5cfa5f0cfb1dec8b5760c662b9a30b3d70d8b9))
* unify input output and logs panels ([69f1fb3](https://github.com/chattocorp/runling/commit/69f1fb349130172a9d9ef5451a3204a3f715f909))
* use braille indicators for recent runs ([2983c65](https://github.com/chattocorp/runling/commit/2983c65865aa03b1e690e4347647042168b31026))


### Bug Fixes

* log when the web server starts shutting down ([31298b7](https://github.com/chattocorp/runling/commit/31298b746d638754175394538e1f492ebf020ee5))

## [0.5.0](https://github.com/chattocorp/runling/compare/v0.4.1...v0.5.0) (2026-09-06)


### ⚠ BREAKING CHANGES

* make run usage accounting controls internal
* slim runtime API and scope usage totals to runs

### Features

* start web server without a config file ([1c8eb61](https://github.com/chattocorp/runling/commit/1c8eb61d931eb23438ebdb35ab9ceb73a3551e5f))
* **web:** improve output tab and remove duplicate timeline output ([53d6f55](https://github.com/chattocorp/runling/commit/53d6f55373b97fca32b7f97ee131c05d55d08e5c))
* **web:** inspect activities in a modal and add form submit shortcut ([ab5bb85](https://github.com/chattocorp/runling/commit/ab5bb852a4f0f2720659b930cd1d153ec86a7786))
* **web:** migrate UI to Tailwind and DaisyUI ([9d29f15](https://github.com/chattocorp/runling/commit/9d29f159205951053fc06327bb811932635a4f01))
* **web:** show Braille spinner on active timeline tasks ([74cb237](https://github.com/chattocorp/runling/commit/74cb23760eef29c0e8ee30637079c8d4b195f2bc))
* **web:** streamline sidebar layout and run summaries ([4fad0eb](https://github.com/chattocorp/runling/commit/4fad0eb2900570a71774e5a40ee3c1971c686d09))


### Bug Fixes

* prepare SvelteKit files for tests and update CLI validation test ([a8c92ac](https://github.com/chattocorp/runling/commit/a8c92acca4de418ebf00514d3e0c0661c5aacae7))
* **web:** bound timeline zoom to actual activity endpoints ([b27483b](https://github.com/chattocorp/runling/commit/b27483bd83e44964753cf9d9f3a111000b64dcd4))
* **web:** give timeline labels a two-line layout ([48ac84e](https://github.com/chattocorp/runling/commit/48ac84e531b9989434442ca9aa5def7626ce7f23))


### Code Refactoring

* make run usage accounting controls internal ([c9c9945](https://github.com/chattocorp/runling/commit/c9c99450c01e6dd0a089b1f28def2a476903c75b))
* slim runtime API and scope usage totals to runs ([5bc51f5](https://github.com/chattocorp/runling/commit/5bc51f500556d8a2bc2bbfb7ed57c08a276d405d))

## [0.4.1](https://github.com/chattocorp/runling/compare/v0.4.0...v0.4.1) (2026-09-05)


### Bug Fixes

* **ci:** simplify tests and publish an explicit local tarball ([d12780a](https://github.com/chattocorp/runling/commit/d12780a8d80029e4aeddf40fc701e19e1bc381f5))

## [0.4.0](https://github.com/chattocorp/runling/compare/v0.3.0...v0.4.0) (2026-09-05)


### Features

* **web:** add persistent sidebar toggle ([39e99ec](https://github.com/chattocorp/runling/commit/39e99ecf5f39fbe570f454eb38598bd69e4cbf06))
* **web:** give timeline bars a subtle raised finish ([c7e943e](https://github.com/chattocorp/runling/commit/c7e943e07a05ff21ab77d04a917cc4ea4ae74b53))
* **web:** toggle sidebars with Command or Control B ([0988c8c](https://github.com/chattocorp/runling/commit/0988c8c603f066a715be3ea6725b9e68ad05cc47))


### Bug Fixes

* stop consumer process tree and retry smoke test cleanup ([ff25300](https://github.com/chattocorp/runling/commit/ff25300a3b517f9c1d6979818db1e10ba1095081))
* **web:** place sidebar toggle beside the logo ([996b47e](https://github.com/chattocorp/runling/commit/996b47ebdb6e0b276c7fba81b6b2f11f1c3d4b9d))
