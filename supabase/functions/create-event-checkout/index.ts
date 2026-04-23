import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();

    const { data: eventItem, error } = await supabase
      .from("events")
      .insert({
        title: body.title,
        country: body.country,
        department: body.department,
        venue_name: body.venue_name,
        address: body.address,
        event_date: body.event_date,
        phone: body.phone,
        contact_email: body.contact_email,
        poster_url: body.poster_url,
        description: body.description,
        source_type: "manual",
        status: "draft",
        stripe_payment_status: "created"
      })
      .select()
      .single();
    if (error) throw error;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      line_items: [{ price: Deno.env.get("STRIPE_EVENT_PRICE_ID")!, quantity: 1 }],
      customer_email: body.contact_email || undefined,
      metadata: {
        target_type: "event",
        target_id: eventItem.id
      }
    });

    await supabase.from("events").update({
      stripe_checkout_session_id: session.id
    }).eq("id", eventItem.id);

    await supabase.from("payments").insert({
      target_type: "event",
      target_id: eventItem.id,
      amount_cents: 500,
      stripe_checkout_session_id: session.id,
      payment_status: "created"
    });

    return Response.json({ checkout_url: session.url }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error.message }, { headers: cors, status: 400 });
  }
});
