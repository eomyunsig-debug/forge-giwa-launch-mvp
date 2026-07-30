/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_TAGLINE?: string;
  readonly VITE_INDEXER_URL?: string;
  readonly VITE_LOCAL_RPC_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CHAIN_NAME?: string;
  readonly VITE_GIWA_RPC_URL?: string;
  readonly VITE_GIWA_EXPLORER_URL?: string;
  readonly VITE_GIWA_DEPLOYMENT_MODE?: string;
  readonly VITE_GIWA_FACTORY_ADDRESS?: string;
  readonly VITE_GIWA_PROTOCOL_CONFIG_ADDRESS?: string;
  readonly VITE_GIWA_SELF_HOSTED_AMM_ADAPTER_ADDRESS?: string;
  readonly VITE_GIWA_DEPLOYED_BLOCK?: string;
  readonly VITE_FACTORY_ADDRESS?: string;
  readonly VITE_PROTOCOL_CONFIG_ADDRESS?: string;
  readonly VITE_LOCAL_AMM_ADAPTER_ADDRESS?: string;
  readonly VITE_PUBLIC_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
