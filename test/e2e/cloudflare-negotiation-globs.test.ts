import { cloudflareNegotiationSuite } from '../helpers/cloudflare-negotiation-suite'

// 60 nested pages need 120 exact worker-first entries, past Cloudflare's 100.
cloudflareNegotiationSuite('/', false, 'config', 'explicit', 60)
