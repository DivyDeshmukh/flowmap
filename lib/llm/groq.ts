import Groq from "groq-sdk";

const groqApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;

if (!groqApiKey) {
    throw new Error("NEXT_PUBLIC_GROQ_API_KEY is not set in environment variables.");
}

const groq = new Groq({
    apiKey: groqApiKey
});

export default groq;
