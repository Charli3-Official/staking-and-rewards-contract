import { CONFIG } from './config.js';

export async function requestCertificate(operationType, stakingUtxo, providerUtxo, providerKey, signature, timestamp, newValue = null) {
    try {
        const requestBody = {
            operationType,
            stakingUtxo,
            providerUtxo,
            providerKey,
            signedMessage: signature,
            timestamp
        };

        if (newValue !== null) {
            requestBody.newValue = newValue.toString();
        }

        console.log('Requesting certificate from issuer:', CONFIG.CERTIFICATE_ISSUER_API_URL + '/certificate/issue');
        console.log('Request body:', requestBody);

        const response = await fetch(CONFIG.CERTIFICATE_ISSUER_API_URL + '/certificate/issue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Certificate issuer API request failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!data.success || !data.certificate) {
            throw new Error('Invalid API response: missing certificate data');
        }

        console.log('Received certificate from issuer:', data.certificate);
        return data.certificate;

    } catch (error) {
        console.error('Error requesting certificate from API:', error);
        throw error;
    }
}

export function createSignaturePayload(operationType, stakingUtxo, providerUtxo, timestamp) {
    return JSON.stringify({
        operationType,
        stakingUtxo,
        providerUtxo,
        timestamp
    });
}