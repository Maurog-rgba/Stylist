# AGENTS.md — Stylist

## 1. Contexto

Stylist é um MVP monolítico de aplicativo mobile React Native para análise de looks e roupas via IA. Toda inferência visual é executada **100% offline** no próprio dispositivo, utilizando um modelo Vision-Language quantizado (`.gguf`) processado via `llama.cpp`. O arquivo `.gguf` é embarcado diretamente nos assets do Android durante a fase de testes para simplificar o ciclo de desenvolvimento.

## 2. Arquitetura de Dados

```
[Captura pela Câmera]
       │
       ▼
[Redimensionamento/Compressão]
  (evitar gargalo de RAM — reduzir resolução antes de enviar ao motor)
       │
       ▼
[Passagem via JSI para o motor C++ (react-native-llama)]
       │
       ▼
[Processamento pelo llama.cpp]
  (modelo .gguf carregado em memória, inferência multimodal)
       │
       ▼
[Retorno estruturado em JSON]
  {
    "score": number,        // 0-100
    "analysis": string,     // descrição textual do look
    "tags": string[],       // estilo, ocasião, cores etc.
    "inferenceTimeMs": number
  }
```

Fluxo resumido: **Câmera → Resize/Compress → JSI → llama.cpp → JSON**

## 3. Diretrizes Estritas de Engenharia

### 3.1 Controle Agressivo de Memória

- O modelo Vision-Language consome RAM significativa. **Nunca** manter múltiplas cópias da imagem em memória simultaneamente.
- **Proibido** trafegar imagens em base64 pela ponte JS/Nativa. Toda transferência de dados de imagem deve ocorrer via buffers nativos (JSI `ArrayBuffer` ou referência de memória compartilhada), eliminando serialização custosa e cópias redundantes.
- Após cada inferência, liberar explicitamente os buffers associados. Descarregar o modelo da memória (`unloadModel`) quando o app entrar em background.
- Monitorar `onMemoryWarning` e implementar fallback de descarregamento forçado.

### 3.2 Caminho dos Assets (Arquivo .gguf)

- O arquivo `.gguf` é empacotado em `android/app/src/main/assets/models/`.
- Na **primeira execução** do app, copiar o `.gguf` de `assets` para o diretório de documentos do app (`context.filesDir` no Android) — o `llama.cpp` requer caminho absoluto no file system e não consegue ler diretamente dos assets comprimidos do APK.
- Verificar hash do arquivo copiado para evitar corrupções e re-copiar apenas se necessário.
- Exemplo de caminho final: `{filesDir}/models/stylist-v1.gguf`

### 3.3 Tratamento de Erros

- **OOM (Out of Memory)**: Capturar exceções de alocação nativa. Se a carga do modelo falhar, exibir mensagem amigável ao usuário e sugerir fechar apps em segundo plano. Nunca crashar silenciosamente.
- **Timeout de Inferência**: Definir timeout máximo (ex.: 30s). Se excedido, abortar a inferência via `llama_cancel` e retornar estado de erro tratado.
- **Modelo não encontrado**: Se o `.gguf` não estiver no caminho esperado, exibir tela de "Recurso não disponível" com instruções.
- **Fallback geral**: Toda operação assíncrona deve ter tratamento de `try/catch` com logging via `react-native-mmkv` para diagnóstico offline.

## 4. Roadmap de Tarefas Inicial

- [ ] Inicializar React Native (Template TypeScript).
- [ ] Habilitar Nova Arquitetura (JSI/Fabric) no template.
- [ ] Instalar e configurar `react-native-vision-camera` (permissões, setup de câmera).
- [ ] Instalar `react-native-llama` e configurar scripts do Gradle para lidar com binários grandes nos assets (evitar compressão do `.gguf` pelo aapt2).
- [ ] Criar serviço TypeScript (`ModelService`) para gerenciar o ciclo de vida do modelo:
  - `loadModel(path: string): Promise<void>`
  - `infer(imageBuffer: ArrayBuffer): Promise<InferenceResult>`
  - `unloadModel(): Promise<void>`
- [ ] Montar UI mínima:
  - Tela de câmera em tela cheia (`react-native-vision-camera`).
  - Botão de captura flutuante.
  - Modal de resultado exibindo score, análise textual e tags.
