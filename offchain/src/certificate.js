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

        const response = await fetch(CONFIG.CERTIFICATE_ISSUER_API_URL + '/certificate/issue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            let errorMessage = `Certificate issuer API request failed with status ${response.status}`;

            try {
                const errorData = await response.json();
                if (typeof errorData.error === 'string') {
                    errorMessage = errorData.error;
                } else if (errorData.error && errorData.error.message) {
                    errorMessage = errorData.error.message;
                } else if (errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (parseError) {
                const errorText = await response.text();
                if (errorText) {
                    errorMessage += `: ${errorText}`;
                }
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data.success || !data.certificate) {
            throw new Error('Invalid API response: missing certificate data');
        }

        console.log('Certificate received successfully');
        return data.certificate;

    } catch (error) {
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