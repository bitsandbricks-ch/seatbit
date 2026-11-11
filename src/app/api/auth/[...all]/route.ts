import { getAuth } from "@/lib/auth";

// Resolve the instance per request so settings changes apply without a restart.
const handler = (req: Request) => getAuth().handler(req);

export { handler as GET, handler as POST };
