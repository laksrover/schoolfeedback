// netlify/functions/badwords-check.js
const querystring = require('querystring');
const fetch = require('node-fetch');         // node-fetch@2 for CommonJS
const sgMail = require('@sendgrid/mail');

exports.handler = async (event, context) => {
  try {
    // 1. Ensure we only accept POST
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed: Use POST' };
    }

    // 2. Parse the form data (URL-encoded)
    //    Example event.body: "feedback=Hello+world"
    const formData = querystring.parse(event.body || '');
    const feedback = formData.feedback || '';

    // 3. Call OpenAI to both categorize and detect offensive content in one shot
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return { statusCode: 500, body: 'OpenAI API Key not configured' };
    }

    
    // Construct a ChatCompletion request
    // We'll instruct GPT to output JSON with categories + offensive status
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',  // or 'gpt-4' if you have access
        messages: [
          {
            role: 'system',
            content: `
You are a helpful AI assistant. Classify the user's feedback into one or more labels from this set:
[bullying, complaint, suggestions, praise, administrative, other].

Also detect if the feedback has offensive or bad words. 
Return your answer in strict JSON format as follows:

{
  "categories": ["one or more labels"],
  "offensive": true/false,
  "summary": "a short summary of the content"
}

Do not include extra keys or text outside the JSON.
`
          },
          {
            role: 'user',
            content: feedback
          },
        ],
        max_tokens: 200,
      }),
    });

 if (!chatResponse.ok) {
    console.error("OpenAI error", await chatResponse.text());
    return {
      statusCode: 500,
      body: `OpenAI API error, please try again later`
    };
  }
  //const data = await response.json();
    //  const chatData = data;
    const chatData = await chatResponse.json();
    // chatData.choices[0].message.content should contain the JSON string from GPT
    const rawContent = chatData?.choices?.[0]?.message?.content?.trim() || '{}';



    let classification = {};
    try {
      classification = JSON.parse(rawContent);
    } catch (e) {
      console.error('Failed to parse GPT JSON:', rawContent);
      classification = { categories: ['other'], offensive: false, summary: '' };
    }

    const { categories = [], offensive = false, summary = '' } = classification;

    // 4. Build subject with labels
    // E.g. "[complaint][contains bad words] Some short summary"
    // or "[praise] Some short summary"
    let subjectLabels = categories.map(cat => `[${cat}]`).join('');
    if (offensive) {
      subjectLabels += '[contains bad words]';
    }

    // If you want to add a default subject in case summary is blank, do so:
    const subject = `${subjectLabels || '[other]'} ${summary || 'New Feedback'}`.trim();

    // 5. Send Email via SendGrid
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    if (!SENDGRID_API_KEY) {
      return { statusCode: 500, body: 'SendGrid API Key not configured' };
    }

    sgMail.setApiKey(SENDGRID_API_KEY);
//    const TO_EMAIL = 'admin@example.com';          // Replace with your real recipient
//    const FROM_EMAIL = 'verified_sender@example.com'; // Must be verified in SendGrid

    const TO_EMAIL = 'info@schoolfeedback.org';
    const FROM_EMAIL = 'info@schoolfeedback.org';

    await sgMail.send({
      to: TO_EMAIL,
      from: FROM_EMAIL,
      subject: subject,
      text: `Feedback content:\n\n${feedback}`,
      // You could also include classification data if you want:
      // html: `...`
    });

console.log("OPENAI_API_KEY", process.env.OPENAI_API_KEY);

console.log("rawContent: ", rawContent);

    // // 6. Return a success response
    // return {
    //   statusCode: 200,
    //   body: JSON.stringify({
    //     success: true,
    //     categories,
    //     offensive,
    //     summary,
    //     subject,
    //     message: 'Feedback processed, AI-labeled, and email sent ' + TO_EMAIL
    //   }),
    // };

        // 6. Return a success response
    return {
      statusCode: 200,
      body: '<HTML><body>Thank you! Your feedback has been submitted, processed, AI-labeled, and an email has been sent to ' + TO_EMAIL + ' <a href="/index.html">Back to the main page</a></body></html>'
      }),
    };


  } catch (err) {
    console.error('Error in badwords-check function:', err);
    return {
      statusCode: 500,
      body: `Server Error: ${err}`
    };
  }
};
