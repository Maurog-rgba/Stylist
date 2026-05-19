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

- Os arquivos `.gguf` são empacotados em `android/app/src/main/assets/models/`.
- Na **primeira execução** do app, copiar o `.gguf` de `assets` para o diretório de documentos do app (`context.filesDir` no Android) — o `llama.cpp` requer caminho absoluto no file system e não consegue ler diretamente dos assets comprimidos do APK.
- Verificar hash do arquivo copiado para evitar corrupções e re-copiar apenas se necessário.
- Exemplo de caminho final: `{filesDir}/models/stylist-v1.gguf`
- **IMPORTANTE**: Modelos grandes (4.5 GB) NÃO são embarcados no APK (limite ZIP 4 GB). Durante o desenvolvimento, enviar via `adb push` para `{filesDir}/models/`. Em produção, baixar de um servidor na primeira execução.

### 3.3 Tratamento de Erros

- **OOM (Out of Memory)**: Capturar exceções de alocação nativa. Se a carga do modelo falhar, exibir mensagem amigável ao usuário e sugerir fechar apps em segundo plano. Nunca crashar silenciosamente.
- **Timeout de Inferência**: Definir timeout máximo (ex.: 30s). Se excedido, abortar a inferência via `llama_cancel` e retornar estado de erro tratado.
- **Modelo não encontrado**: Se o `.gguf` não estiver no caminho esperado, exibir tela de "Recurso não disponível" com instruções.
- **Fallback geral**: Toda operação assíncrona deve ter tratamento de `try/catch` com logging via `react-native-mmkv` para diagnóstico offline.

## 4. Roadmap de Tarefas Inicial

- [x] Inicializar React Native (Template TypeScript).
- [x] Habilitar Nova Arquitetura (JSI/Fabric) no template.
- [x] Instalar e configurar `react-native-vision-camera` (permissões, setup de câmera).
- [x] Instalar `react-native-llama` e configurar scripts do Gradle para lidar com binários grandes nos assets (evitar compressão do `.gguf` pelo aapt2).
- [x] Criar serviço TypeScript (`ModelService`) para gerenciar o ciclo de vida do modelo:
  - `loadModel(path: string): Promise<void>`
  - `infer(imageBuffer: ArrayBuffer): Promise<InferenceResult>`
  - `unloadModel(): Promise<void>`
- [x] Montar UI mínima:
  - Tela de câmera em tela cheia (`react-native-vision-camera`).
  - Botão de captura flutuante.
  - Modal de resultado exibindo score, análise textual e tags.

## 5. Arquivos de Modelo (Download Obrigatório)

Os modelos **NÃO** estão no repositório (`.gitignore`) e precisam ser baixados separadamente.

### 5.1 Origem

Repositório HuggingFace: [`mys/ggml_llava-v1.5-7b`](https://huggingface.co/mys/ggml_llava-v1.5-7b)

### 5.2 Arquivos necessários

| Arquivo | Tamanho | Função |
|---|---|---|
| `ggml-model-q4_k.gguf` | 4.08 GB | Modelo LLaMA 7B quantizado Q4_K_M |
| `mmproj-model-f16.gguf` | 624 MB | CLIP Vision Encoder + Projetor LLaVA |

### 5.3 Download

```bash
mkdir -p models
wget -P models/ https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/ggml-model-q4_k.gguf
wget -P models/ https://huggingface.co/mys/ggml_llava-v1.5-7b/resolve/main/mmproj-model-f16.gguf
```

### 5.4 Envio para o dispositivo (adb push)

```bash
adb shell mkdir -p /data/data/com.stylist/files/models
adb push models/ggml-model-q4_k.gguf /data/data/com.stylist/files/models/
adb push models/mmproj-model-f16.gguf /data/data/com.stylist/files/models/
```

### 5.5 Caminho esperado pelo app

```
{filesDir}/models/ggml-model-q4_k.gguf
{filesDir}/models/mmproj-model-f16.gguf
```

O `ModelService.ensureModelAssets()` resolve automaticamente esses caminhos.

## 6. Estrutura do Projeto

```
Stylist/
├── AGENTS.md                          # Este arquivo
├── App.tsx                            # Entry point (fluxo completo)
├── src/
│   ├── NativeStylistInference.ts      # Spec do módulo nativo
│   ├── components/
│   │   └── ResultModal.tsx            # Modal de resultado
│   ├── hooks/
│   │   └── useModel.ts               # Hook reativo (AppState listener)
│   ├── screens/
│   │   └── CameraScreen.tsx           # Câmera tela cheia
│   └── services/
│       ├── ModelService.ts            # Ciclo de vida do modelo
│       └── types.ts                   # InferenceResult, ImageInput
├── android/
│   └── app/src/main/
│       ├── cpp/
│       │   ├── CMakeLists.txt         # Build llama.cpp + mtmd + nosso código
│       │   ├── StylistInferenceJNI.h  # Engine C++ singleton thread-safe
│       │   └── StylistInferenceJNI.cpp# JNI + llama.cpp + mtmd LLaVA + JPEG decode
│       ├── assets/models/             # .gguf via assets (para modelos pequenos)
│       └── java/com/stylist/
│           ├── AssetCopier.kt         # Cópia assets → filesDir com SHA-256
│           ├── MainActivity.kt
│           ├── MainApplication.kt     # Registro do StylistInferencePackage
│           ├── StylistInferenceModule.kt  # Módulo React Native (Kotlin)
│           └── StylistInferencePackage.kt # TurboReactPackage
├── models/                            # Modelos .gguf (gitignored)
└── package.json                       # RN 0.85.3 + vision-camera + mmkv
```

## 7. Stack Tecnológico Final

| Componente | Versão | Função |
|---|---|---|
| React Native | 0.85.3 | Framework mobile |
| react-native-vision-camera | 4.7.3 | Captura de imagem |
| react-native-mmkv | 3.3.3 | Logging offline |
| react-native-safe-area-context | 5.5.2 | Safe area layout |
| llama.cpp | master (git clone) | Motor de inferência C++ |
| mtmd (llama.cpp) | master | Suporte multimodal LLaVA |
| stb_image | vendor | Decodificação JPEG → RGB |
