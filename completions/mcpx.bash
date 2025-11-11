# Bash completion for mcpx

_mcpx_completion() {
  local cur prev words cword
  _init_completion || return

  local commands="list call help"
  local global_flags="--config --root --log-level --oauth-timeout --help -h --version -v -V"
  local output_formats="auto text json toon raw"
  local log_levels="debug info warn error"

  # First argument (command)
  if [[ $cword -eq 1 ]]; then
    COMPREPLY=($(compgen -W "$commands $global_flags" -- "$cur"))
    return
  fi

  # Handle global flags
  case $prev in
    --config)
      _filedir
      return
      ;;
    --root | --cwd)
      _filedir -d
      return
      ;;
    --log-level)
      COMPREPLY=($(compgen -W "$log_levels" -- "$cur"))
      return
      ;;
    --oauth-timeout | --timeout)
      # Numeric argument, no completion
      return
      ;;
  esac

  # Command-specific completions
  local command="${words[1]}"
  case $command in
    list)
      case $prev in
        --output)
          COMPREPLY=($(compgen -W "$output_formats" -- "$cur"))
          return
          ;;
        *)
          local list_flags="--output --timeout $global_flags"
          COMPREPLY=($(compgen -W "$list_flags" -- "$cur"))
          return
          ;;
      esac
      ;;
    call)
      case $prev in
        --output)
          COMPREPLY=($(compgen -W "$output_formats" -- "$cur"))
          return
          ;;
        --http-url | --stdio | --env | --name)
          # No completion for these
          return
          ;;
        *)
          local call_flags="--output --timeout --http-url --stdio --env --cwd --name --persist $global_flags"
          COMPREPLY=($(compgen -W "$call_flags" -- "$cur"))
          return
          ;;
      esac
      ;;
  esac
}

complete -F _mcpx_completion mcpx
