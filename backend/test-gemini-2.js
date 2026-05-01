const { GoogleGenAI } = require('@google/genai');

async function test() {
    try {
        const ai = new GoogleGenAI({ apiKey: 'dummy_key' });
        await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: 'hello',
        });
    } catch (err) {
        console.log("Error caught: " + err.message);
    }
}
test();
