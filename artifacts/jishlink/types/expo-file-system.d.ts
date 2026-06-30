declare module "expo-file-system" {
  export const cacheDirectory: string | null;
  export const documentDirectory: string | null;
  
  export enum EncodingType {
    Base64 = "base64",
    UTF8 = "utf8",
  }
  
  export function writeAsStringAsync(
    fileUri: string,
    contents: string,
    options?: { encoding?: EncodingType | string }
  ): Promise<void>;
  
  export function readAsStringAsync(
    fileUri: string,
    options?: { encoding?: EncodingType | string }
  ): Promise<string>;
  
  export function deleteAsync(fileUri: string, options?: { idempotent?: boolean }): Promise<void>;
  export function getInfoAsync(fileUri: string, options?: { size?: boolean; md5?: boolean }): Promise<any>;
  export function makeDirectoryAsync(dirUri: string, options?: { intermediates?: boolean }): Promise<void>;
  export function copyAsync(options: { from: string; to: string }): Promise<void>;
  export function moveAsync(options: { from: string; to: string }): Promise<void>;
  export function downloadAsync(url: string, fileUri: string, options?: any): Promise<any>;
}