import { AbstractProvider } from 'web3-core';

declare global {
  interface EthereumProvider extends AbstractProvider {
    request: (args: { method: string; params?: any[] }) => Promise<any>;
    isMetaMask?: boolean;
    sendAsync: (payload: any, callback: (error: any, result: any) => void) => void;
  }

  interface Window {
    ethereum?: EthereumProvider;
    web3?: {
      currentProvider: any;
    };
  }
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.PNG' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

export {}; 