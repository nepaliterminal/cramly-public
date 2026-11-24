import { handleSecurity } from "../server/security.js";
export default { fetch: (request) => handleSecurity(request) };
