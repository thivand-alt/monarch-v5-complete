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

    if (body.target_type === "partner") {
      await supabase.from("partners").update({ status: body.status }).eq("id", body.id);
    } else if (body.target_type === "event") {
      await supabase.from("events").update({ status: body.status }).eq("id", body.id);
    } else {
      throw new Error("target_type invalide");
    }

    await supabase.from("audit_logs").insert({
      action: "admin_status_update",
      target_type: body.target_type,
      target_id: body.id,
      metadata: { status: body.status }
    });

    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: cors });
  }
});
