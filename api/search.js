export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured"
      });
    }

    const { naturalLanguage, filters } = req.body || {};

    const prompt = `
You are CARMATCH AI, an expert worldwide automotive recommendation assistant.

User request:
${naturalLanguage || "No natural-language request provided."}

Filters:
${JSON.stringify(filters || {}, null, 2)}

Find the 3 best matching cars.

Consider:
- cars from manufacturers worldwide
- newest available generation
- model years 2026 or 2027 when available
- exact generation and model year
- price
- power
- number of seats
- drivetrain
- practicality
- maintenance
- advantages
- disadvantages

Return ONLY valid JSON in exactly this format:

{
  "cars": [
    {
      "name": "Brand Model",
      "generation": "Generation name",
      "year": 2026,
      "score": 95,
      "price": "€100,000",
      "power": "300 kW",
      "seats": 2,
      "drive": "AWD",
      "fuel": "Petrol",
      "image": "",
      "photoSource": "",
      "reason": "Why this car matches the request",
      "pros": [
        "Advantage 1",
        "Advantage 2",
        "Advantage 3"
      ],
      "cons": [
        "Disadvantage 1",
        "Disadvantage 2"
      ],
      "maintenance": "Maintenance and ownership considerations",
      "configurator": ""
    }
  ]
}
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "gpt-5.6",
          input: prompt
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);

      return res.status(response.status).json({
        error: "OpenAI API error",
        details: data.error?.message || "Unknown OpenAI error"
      });
    }

    const text = data.output_text || "";

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response"
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error("Invalid JSON from AI:", text);

      return res.status(500).json({
        error: "AI returned invalid JSON"
      });
    }

    if (!parsed.cars || !Array.isArray(parsed.cars)) {
      return res.status(500).json({
        error: "AI response does not contain cars"
      });
    }

    return res.status(200).json({
      cars: parsed.cars.slice(0, 3)
    });

    
  } catch (error) {
    console.error("Backend error:", error);

    return res.status(500).json({
      error: "Backend error",
      message: error.message
    });
  }
}

