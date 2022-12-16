# No Titlebar When Maximized

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg" height="100" align="right">](https://extensions.gnome.org/extension/4630/no-titlebar-when-maximized/)

[No Titlebar When Maximized](https://extensions.gnome.org/extension/4630/no-titlebar-when-maximized/) is a GNOME Shell extension that hides the classic title bar of maximized X.Org windows. It is a rewrite of [Pixel Saver](https://github.com/pixel-saver/pixel-saver) with a focus on simplification. In particular, it does _not_ modify the core shell UI.

**It requires [the `xprop` command](https://command-not-found.com/xprop) to be installed in order to function.**

![Demo](demo.gif)

## Installation

1. Install [the `xprop` command](https://command-not-found.com/xprop).
2. Open [No Titlebar When Maximized](https://extensions.gnome.org/extension/4630/no-titlebar-when-maximized/) on the GNOME Shell Extentions website.
3. Toggle the slider to the on position.

## Development

For information on [creating](https://gjs.guide/extensions/development/creating.html) and [debugging](https://gjs.guide/extensions/development/debugging.html) a GNOME extension, see [the official documentation](https://gjs.guide/extensions).

Dependencies for this project are managed using [npm](https://www.npmjs.com/):

- To format the code, run **`npm run format`**.
- To lint the code, run **`npm run lint`**.
- To create a zip file suitable for [submission to GNOME Extentions](https://extensions.gnome.org/upload/), run **`npm run build`**.

### Workflow

Unfortunately, this extention does not work correctly in [a nested session](https://wiki.gnome.org/Initiatives/Wayland/GnomeShell/Testing#Running_nested_as_a_subcompositor). Here is the workflow that I use for development:

1. If the extension is already installed, uninstall it (`npm run uninstall`).
2. Increment [the `version` number in `metadata.json`](https://github.com/alecdotninja/no-titlebar-when-maximized/blob/main/metadata.json#L7).
3. Build the extension with any local changes (`npm run build`) and install that local build (`npm run install-local`).
4. Restart GNOME Shell. On Wayland, this requires logging out and logging back in.
5. Perform any testing. On systemd-based distros, you can tail the logs with `journalctl /usr/bin/gnome-shell -f`.
6. Repeat steps 3 through 5 until things are working as expected. I find it is helpful to format (`npm run format`) and lint (`npm run lint`) as I go so that my local build is ready for submission.
7. [Submit](https://extensions.gnome.org/upload/) the local build to GNOME Extentions.
8. After approval, uninstall the local build (`npm run uninstall`) and reinstall from [GNOME Extentions](https://extensions.gnome.org/extension/4630/no-titlebar-when-maximized/).

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/alecdotninja/no-titlebar-when-maximized).

## License

This extension is available as open source under the terms of [the GNU General Public License v2.0 or later
](https://spdx.org/licenses/GPL-2.0-or-later.html).
