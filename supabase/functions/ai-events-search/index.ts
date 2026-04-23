import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

// Vrai mode prod recommandé:
// 1) lire les événements approuvés en base
// 2) enrichir avec APIs officielles si disponibles
// 3) utiliser OpenAI pour normaliser / résumer / structurer
// 4) ne pas scraper Facebook / Instagram / TikTok de manière fragile

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { country, department } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const currentYear = new Date().getFullYear();
    const searchQuery = `événements automobiles ${department} ${country} ${currentYear}`;
    
    // Récupérer les événements approuvés en base de données
    const { data: dbEvents, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "approved")
      .eq("country", country)
      .ilike("department", `%${department}%`)
      .order("event_date", { ascending: true });
    if (error) throw error;

    const events = (dbEvents || []).map(ev => ({
      title: ev.title,
      poster_url: ev.poster_url,
      summary: ev.description,
      venue_name: ev.venue_name,
      department: ev.department,
      address: ev.address,
      phone: ev.phone,
      contact_email: ev.contact_email,
      source_url: ev.external_url,
      google_maps_url: ev.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.address)}` : null
    }));

    // Ajouter les liens de recherche externes (Google, Facebook, Instagram, TikTok)
    const searchLinks = [
      {
        title: "🔍 Recherche Google - Événements automobiles",
        summary: `Recherche Google pour les événements automobiles à ${department}, ${country} (${currentYear})`,
        source_url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
        venue_name: "Google Search"
      },
      {
        title: "🔍 Google News - Événements automobiles",
        summary: `Actualités sur les événements automobiles à ${department}, ${country}`,
        source_url: `https://news.google.com/search?q=${encodeURIComponent(searchQuery)}`,
        venue_name: "Google News"
      },
      {
        title: "📘 Facebook - Événements",
        summary: `Rechercher les événements automobiles sur Facebook à ${department}, ${country}`,
        source_url: `https://www.facebook.com/search/events/?q=${encodeURIComponent(`${department} ${country} événements automobiles`)}`,
        venue_name: "Facebook Events"
      },
      {
        title: "📷 Instagram - Hashtags",
        summary: `Découvrir les événements automobiles sur Instagram (#${department.replace(/\s+/g, '')}, #${country}, #events${currentYear})`,
        source_url: `https://www.instagram.com/explore/tags/${encodeURIComponent(department.toLowerCase().replace(/\s+/g, ''))}`,
        venue_name: "Instagram"
      },
      {
        title: "🎵 TikTok - Événements automobiles",
        summary: `Chercher les événements automobiles sur TikTok (${department}, ${country})`,
        source_url: `https://www.tiktok.com/search/video?q=${encodeURIComponent(`${department} ${country} événement automobile`)}`,
        venue_name: "TikTok"
      }
    ];

    // Combiner les événements approuvés avec les liens de recherche
    const allEvents = [
      ...events,
      ...searchLinks
    ];

    return Response.json({ events: allEvents }, { headers: cors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: cors });
  }
});
