import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-04-10" });
  const signature = req.headers.get("stripe-signature")!;
  const body = await req.text();

  try {
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const targetType = session.metadata?.target_type;
      const targetId = session.metadata?.target_id;

      if (targetType === "partner" && targetId) {
        await supabase.from("partners")
          .update({ stripe_payment_status: "paid", status: "paid", stripe_customer_id: String(session.customer || "") })
          .eq("id", targetId);
      }

      if (targetType === "event" && targetId) {
        await supabase.from("events")
          .update({ stripe_payment_status: "paid", status: "pending_review" })
          .eq("id", targetId);
      }

      await supabase.from("payments")
        .update({
          payment_status: "paid",
          stripe_payment_intent_id: String(session.payment_intent || ""),
          stripe_customer_id: String(session.customer || "")
        })
        .eq("stripe_checkout_session_id", session.id);

      await supabase.from("audit_logs").insert({
        action: "stripe_checkout_completed",
        target_type: targetType || "unknown",
        target_id: targetId || null,
        metadata: { session_id: session.id }
      });
    }

    return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "content-type": "application/json" } });
  }
});
