# List, add, or delete UI tabs

[`tab.ts`](tab.ts) adds a tab to a supported shell, registers its route in `src/router.ts`, and creates a placeholder BTSX page under `src/pages/`. It can also remove those three pieces.

Run commands from the repository root after installing dependencies with `bun install`. No backend credentials are needed.

## Interactive menu

Run without arguments to choose an action and shell from numbered menus:

```sh
bun run tab
```

Enter the number beside an option, then press Enter. Choose **View current tabs**, **Add a tab**, **Delete a tab**, or **Exit**.

- Viewing supports one shell or all shells.
- Adding asks for a new ID, label, and icon. Press Enter to accept a displayed default. You can optionally customize the short label, route path, link, and page filename.
- Deleting lets you select an existing tab and specify its page filename, including any custom filename used when creating it.
- Add/delete lets you choose preview or apply. Preview writes nothing. Apply displays the affected files and asks for confirmation; only `y` or `yes` proceeds. Existing pages are preserved when adding.

Press Ctrl+C to cancel a prompt without making changes. Interactive mode requires a terminal. Existing flag-based commands remain available for scripts and automation.

To preselect a shell or force a preview:

```sh
bun run tab --interactive --shell admin-settings
bun run tab --interactive --dry-run
```

`--interactive` accepts only `--shell` and `--dry-run`; use the flag-based commands below for other options.

## View current tabs

List tabs in every supported shell, or select one shell:

```sh
bun run tab --list
bun run tab --list --shell admin-settings
```

Shows each tab's ID, label, short label, URL (`href`), and icon in source order. The command reads the current `panelRoutes` declarations without executing the page or changing files. No `--id` is needed. Listing cannot be combined with add/delete options; `--dry-run` is accepted but unnecessary. Entries must use literal objects and string values; unsupported dynamic definitions produce an error.

## Supported shells

| `--shell`          | Shell file                             | Default URL base    | Default page filename             |
| ------------------ | -------------------------------------- | ------------------- | --------------------------------- |
| `citadel-settings` | `src/pages/citadel-settings-page.btsx` | `/citadel/settings` | `citadel-settings-<id>-page.btsx` |
| `admin-settings`   | `src/pages/admin-settings-page.btsx`   | `/admin-settings`   | `admin-settings-<id>-page.btsx`   |
| `citadel-accounts` | `src/pages/citadel-accounts-page.btsx` | `/citadel/accounts` | `citadel-accounts-<id>-page.btsx` |

## Usage

Preview a new tab before writing files:

```sh
bun run tab --shell citadel-settings --id tools --label Tools --icon tools --dry-run
```

Add the tab by omitting `--dry-run`:

```sh
bun run tab --shell citadel-settings --id tools --label Tools --icon tools
```

The equivalent direct invocation is:

```sh
bun run scripts/codegen/tab.ts --shell citadel-settings --id tools --label Tools --icon tools
```

| Argument               | Meaning and default                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--shell <name>`       | Required for add/delete; optional for `--list`. One of the supported shells above.                                                                                                        |
| `--id <id>`            | Required for add/delete. Lowercase letters or digits separated by single hyphens, such as `audit-log`. Used for the tab ID and generated route name.               |
| `--label <text>`       | Full label; defaults to title-casing the ID (`audit-log` becomes `Audit Log`).                                                                      |
| `--short-label <text>` | Compact label; defaults to the full label.                                                                                                          |
| `--icon <name>`        | Icon name; defaults to `settings`. Use an icon supported by the app.                                                                                |
| `--path <segment>`     | Route segment; defaults to the ID. Leading slashes are stripped; remaining slashes and spaces are rejected.                                         |
| `--href <href>`        | Tab link; defaults to the shell's URL base plus the route segment. This overrides the link, not the generated route path.                           |
| `--file <name.btsx>`   | Page filename; defaults to the shell-specific filename above. Use a filename without directories or spaces, ending in `.btsx`.                      |
| `--dry-run`            | Print the planned changes without writing files or prompting for deletion.                                                                          |
| `--force`              | Overwrite an existing page with the generated placeholder when adding a tab. Does not update existing tab metadata or bypass deletion confirmation. |
| `--delete`, `--remove` | Remove the tab entry, generated route declaration, parent route membership, and page file after confirmation.                                       |
| `--list` | List current tabs without changing files; omit `--shell` to list all shells. |
| `--help`, `-h`         | Print help and exit.                                                                                                                                |

Use space-separated flag values, such as `--id tools`. The parser does not validate unknown option names, so check spelling. Labels and other string options are inserted into generated source without escaping; avoid quotes, backslashes, and newlines that would break the generated code.

## Customize a tab

```sh
bun run tab --shell admin-settings --id audit-log --label 'Audit Log' --short-label Audit --icon settings --path history --file admin-audit-history-page.btsx --dry-run
```

This previews a tab at `/admin-settings/history`, a route named `adminSettingsAuditLogRoute`, and the page `src/pages/admin-audit-history-page.btsx`. Remove `--dry-run` to apply it. Keep any custom `--href` aligned with the generated route.

## Delete a tab

Preview removal:

```sh
bun run tab --shell citadel-settings --id tools --delete --dry-run
```

Apply removal:

```sh
bun run tab --shell citadel-settings --id tools --delete
```

The script lists the affected entries and file, then asks `Delete these? [y/N]`. Only `y` or `yes` confirms. Any other answer aborts without changes and exits with status 1. If nothing matches, it reports that there is nothing to delete.

If you created the tab with a custom `--file`, pass that same filename when deleting; the script calculates the page filename from the arguments rather than discovering it from the existing route:

```sh
bun run tab --shell admin-settings --id audit-log --file admin-audit-history-page.btsx --delete --dry-run
```

## Generated changes and verification

For the `citadel-settings` / `tools` example, the script:

1. Adds a `tools` entry to `panelRoutes` in `src/pages/citadel-settings-page.btsx`.
2. Adds `citadelSettingsToolsRoute` and its parent route membership in `src/router.ts`.
3. Writes `src/pages/citadel-settings-tools-page.btsx` with placeholder content.

Existing tab entries and route declarations are skipped rather than updated. An existing page is preserved unless `--force` is passed. Review the printed plan, especially when deleting or overwriting a page containing custom work.

After applying changes, inspect the diff, replace any placeholder content, and check the app:

```sh
git diff -- src/pages src/router.ts
git status --short
bun run check
```

New page files appear in `git status` but not in an unstaged `git diff` until tracked. The generator does not run formatting, type checking, or a build automatically. Unknown shells, invalid IDs or paths, and missing source anchors produce errors and exit with status 1.
