# Repository UI Instructions

## UI changes

Before changing React markup, Arco components, CSS, layout, typography, tables, toolbars, tabs, dialogs, or responsive behavior:

1. Read `design-system/MASTER.md` completely.
2. Check `design-system/pages/<page>.md` for a page-specific exception.
3. Prefer components exported from `components/ui` over one-off layout markup.
4. Run `npm run verify:ui` before declaring the work complete.

Dynamic text in Flex/Grid layouts must have a shrinkable ancestor (`min-width: 0`). Use `OverflowText`, `ActionGroup`, `Toolbar`, and `TableShell` for their documented contracts.

Do not introduce `whitespace-nowrap`, `overflow: hidden`, `overflow-x: hidden`, or fixed width/height on dynamic-content containers unless the behavior is intentional, carries a supported `data-overflow-policy`, and is covered by a layout test.

Keep Electron's 1100px minimum window behavior. Mobile layouts below 1100px are outside the default scope unless a task explicitly changes that scope.

## Development validation

During implementation, run `npm run check:fast` for the short feedback loop. Before handing off any change, run `npm run verify:changed`; UI work must still complete `npm run verify:ui` as required above. Use `npm run review:changed` when the user wants the development App opened after checks.

Never run `npm run release:stage` unless the user explicitly requests a release. Prefer `npm run release:stage -- --dry-run` when validating release readiness without changing versions, tags, releases, or remotes.
