import { useDevtoolsConnection } from 'nuxtseo-layer-devtools/composables/rpc'

// The layer owns host fetch + route tracking and refreshes on connect; ai-ready's
// state.ts watches refreshTime to reload the global debug data, so no module-level
// host access is needed here.
useDevtoolsConnection()
