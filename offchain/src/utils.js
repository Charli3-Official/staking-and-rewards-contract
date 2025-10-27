import { createInterface } from 'readline';

export async function confirmOperation(operationName, details) {
    console.log(`\n=== ${operationName.toUpperCase()} CONFIRMATION ===`);
    for (const [key, value] of Object.entries(details)) {
        console.log(`${key}: ${value}`);
    }
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question('Do you want to proceed? (y/N): ', (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}