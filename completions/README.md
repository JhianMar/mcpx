# Shell Completions for mcpx

This directory contains shell completion scripts for mcpx.

## Installation

### Zsh

Add to `~/.zshrc`:

```zsh
# Option 1: Copy to local completions directory
mkdir -p ~/.zsh/completions
cp completions/_mcpx ~/.zsh/completions/
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit && compinit

# Option 2: If installed via Homebrew (automatic)
# Completions are installed automatically to $(brew --prefix)/share/zsh/site-functions
```

### Bash

Add to `~/.bashrc` or `~/.bash_profile`:

```bash
# Option 1: Source directly
source /path/to/mcpx/completions/mcpx.bash

# Option 2: If installed via Homebrew (automatic)
# Completions are installed automatically to $(brew --prefix)/etc/bash_completion.d
```

### Fish

```fish
# Option 1: Copy to fish completions directory
mkdir -p ~/.config/fish/completions
cp completions/mcpx.fish ~/.config/fish/completions/

# Option 2: If installed via Homebrew (automatic)
# Completions are installed automatically to $(brew --prefix)/share/fish/vendor_completions.d
```

## Features

- Command completion: `list`, `call`, `auth`
- Flag completion: `--config`, `--output`, `--timeout`, etc.
- Value completion for flags:
  - `--output`: `auto`, `text`, `json`, `toon`, `raw`
  - `--log-level`: `debug`, `info`, `warn`, `error`
- File/directory completion for path arguments

## Development

To test completions without installation:

### Zsh
```zsh
# Load completion in current shell
source completions/_mcpx
compdef _mcpx mcpx
```

### Bash
```bash
source completions/mcpx.bash
```

### Fish
```fish
source completions/mcpx.fish
```

## Future Enhancements

- Dynamic completion for server names (read from config)
- Dynamic completion for tool selectors (server.tool)
- Add `mcpx completion <shell>` command to generate completions
