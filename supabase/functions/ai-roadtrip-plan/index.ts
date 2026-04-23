import OpenAI from "https://esm.sh/openai@4.56.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

async function googlePlacesSearch(query: string) {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!apiKey) return [];
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  return (data.results || []).slice(0, 5);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const scenic = await googlePlacesSearch(`best scenic viewpoints near ${body.department} ${body.country}`);
    const restaurants = await googlePlacesSearch(`best Michelin or highly rated restaurants near ${body.department} ${body.country}`);
    const hotels = await googlePlacesSearch(`best hotels near ${body.department} ${body.country}`);

    const prompt = `
Tu crées un road trip premium automobile pour MONARCH SUPERCARS.
Données utilisateur:
${JSON.stringify(body, null, 2)}

Candidats points de vue:
${JSON.stringify(scenic, null, 2)}

Candidats restaurants:
${JSON.stringify(restaurants, null, 2)}

Candidats hôtels:
${JSON.stringify(hotels, null, 2)}

Retourne strictement du JSON avec:
{
  "summary": "texte long imprimable",
  "stops": [
    {"name":"","type":"viewpoint|restaurant|hotel","address":"","reason":"","rating":""}
  ]
}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const text = response.output_text || "{}";
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { summary: text, stops: [] }; }

    const addresses = [body.start_address, ...(parsed.stops || []).map((s: any) => s.address).filter(Boolean)];
    const encoded = addresses.map((a: string) => encodeURIComponent(a));
    const googleMapsUrl = addresses.length > 1
      ? `https://www.google.com/maps/dir/${encoded.join("/")}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(body.start_address)}`;

    const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(addresses[addresses.length - 1] || body.start_address)}&navigate=yes`;

    await supabase.from("roadtrip_requests").insert({
      payload: body,
      ai_summary: parsed.summary || "",
      route_google_maps_url: googleMapsUrl,
      route_waze_url: wazeUrl
    });

    return Response.json({
      summary: parsed.summary || "",
      stops: parsed.stops || [],
      google_maps_url: googleMapsUrl,
      waze_url: wazeUrl
    }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: cors });
  }
});
