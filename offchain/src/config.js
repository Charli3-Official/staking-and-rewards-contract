import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
    TOKEN_POLICY_ID: (process.env.TOKEN_POLICY_ID || ''),
    TOKEN_ASSET_NAME: (process.env.TOKEN_ASSET_NAME || ''),
    TOKEN_DECIMALS: parseInt(process.env.TOKEN_DECIMALS || '6'),
    CERTIFICATE_ISSUER_API_URL: process.env.CERTIFICATE_ISSUER_API_URL,
    STAKING_CONTRACT_ADDRESS: process.env.STAKING_CONTRACT_ADDRESS,
    OPERATOR_ADDRESS: process.env.OPERATOR_ADDRESS,
    PENALTY_ADDRESS: process.env.PENALTY_ADDRESS
};