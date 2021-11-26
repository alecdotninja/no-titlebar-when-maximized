# No Titlebar When Maximized

[No Titlebar When Maximized](https://extensions.gnome.org/extension/4630/no-titlebar-when-maximized/) is a GNOME extension to hide the title bar of maximized windows. It is a rewrite of [Pxel Saver](https://github.com/pixel-saver/pixel-saver) with a focus on simplification. In particular, it does *not* modify the core shell UI.

![Demo](demo.gif)

## Installation

The preferred method for installing No Titlebar When Maximized is via [the GNOME Shell Extensions web interface](https://extensions.gnome.org/extension/4630/no-titlebar-when-maximized/) or [the Software application](https://linuxhint.com/install_gnome_shell_extensions_linux/). It requires [the `xprop` command](https://command-not-found.com/xprop) to be installed in order to work correctly.

The extension can also be installed manually by copying the `no-titlebar-when-maximized@alec.ninja` directory to `~/.local/share/gnome-shell/extensions`, restarting GNOME Shell, and running `gnome-extensions enable no-titlebar-when-maximized@alec.ninja`.

## Development

For information on [creating](https://gjs.guide/extensions/development/creating.html) and [debugging](https://gjs.guide/extensions/development/debugging.html) a GNOME extension, see [the official documentation](https://gjs.guide/extensions).

## Contributing

Bug reports and pull requests are welcome on [GitHub](https://github.com/alecdotninja/no-titlebar-when-maximized).

## License

This extension is available as open source under the terms of [the GNU General Public License v2.0 or later
](https://spdx.org/licenses/GPL-2.0-or-later.html).
