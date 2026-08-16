export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is missing in Production"
    });
  }

  try {
    const { naturalLanguage, filters } = req.body || {};

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5.6",
        input: `You are CARMATCH AI.

User requirements:
${naturalLanguage || "No text provided"}

Filters:
${JSON.stringify(filters || {})}

Return exactly 3 car recommendations.
For each car provide:
- brand and model
- generation
- model year
- price
- power
- seats
- drivetrain
- advantages
- disadvantages
- maintenance
- official configurator URL

Return valid JSON only.`
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenAI request failed",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      result: data.output_text || ""
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
