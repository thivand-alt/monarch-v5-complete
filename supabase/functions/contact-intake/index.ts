import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await supabase.from("contact_messages").insert(body);
    if (error) throw error;

    // Ici tu peux ajouter un envoi Resend si configuré.
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: cors });
  }
});
