# =============================================================
# nasFinance - imagem de producao
# =============================================================
# Build em tres estagios. Cada um pode ser construido isoladamente,
# o que importa muito quando a build roda num servidor com WiFi
# instavel: da para descobrir QUAL estagio quebrou sem refazer tudo.
#
#   docker build --target frontend-build -t nasfinance:f .
#   docker build --target backend-build  -t nasfinance:b .
#   docker build                         -t nasfinance:latest .
#
# O resultado final NAO contem Maven, JDK, Node nem codigo-fonte:
# apenas um JRE e o artefato compilado.
# =============================================================


# -------------------------------------------------------------
# Estagio 1 - compila a interface React
# -------------------------------------------------------------
FROM node:22-alpine AS frontend-build

WORKDIR /build

# package.json e lock copiados ANTES do codigo-fonte: enquanto as
# dependencias nao mudarem, o Docker reaproveita a camada do npm ci
# e pula o download inteiro. Copiar tudo de uma vez invalidaria o
# cache a cada alteracao de componente.
COPY frontend/package.json frontend/package-lock.json ./

# `npm ci` (e nao `npm install`) instala exatamente o que esta no
# lock, sem atualizar nada: a build precisa ser reproduzivel.
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build


# -------------------------------------------------------------
# Estagio 2 - compila o backend Quarkus
# -------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS backend-build

WORKDIR /build

COPY backend/pom.xml ./

# O cache do Maven fica num cache mount do BuildKit, nao numa camada
# da imagem. Assim ele sobrevive entre builds sem inchar o resultado.
# Num servidor com rede instavel isso e decisivo: uma build que falha
# no meio nao perde os artefatos ja baixados.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q dependency:resolve

COPY backend/src ./src

# A interface compilada entra em META-INF/resources, de onde o Quarkus
# serve arquivos estaticos automaticamente. Um unico processo passa a
# servir a API e o site — sem Nginx separado, economizando um container
# inteiro de RAM no servidor.
COPY --from=frontend-build /build/dist ./src/main/resources/META-INF/resources

# COM testes, e nao com -DskipTests. Eles sao unitarios puros — sem banco,
# sem container, sem rede — entao rodam em segundos e nao tornam a build
# fragil. E esta e a unica hora em que eles rodariam: o deploy acontece
# construindo esta imagem na maquina de dev.
#
# O que protegem: a direcao do dinheiro vem de `type`, nunca do sinal de
# `amount`. Trocar os dois inverte metade dos lancamentos do cartao, e nada
# na tela denuncia — R$ 51,85 de receita parece tao plausivel quanto de
# despesa.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B clean package


# -------------------------------------------------------------
# Estagio 3 - imagem final (so JRE + artefato)
# -------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

# Usuario sem privilegios. O container ainda roda com cap_drop: ALL e
# no-new-privileges no compose; isto e a camada de dentro.
RUN addgroup -S nasfinance && adduser -S nasfinance -G nasfinance

WORKDIR /app

# O layout "fast-jar" do Quarkus separa o que muda pouco (lib/) do que
# muda a cada build (app/). Copiar em camadas distintas, da mais estavel
# para a mais volatil, faz o `docker push`/`pull` transferir so o que
# realmente mudou.
COPY --from=backend-build --chown=nasfinance:nasfinance /build/target/quarkus-app/lib/     ./lib/
COPY --from=backend-build --chown=nasfinance:nasfinance /build/target/quarkus-app/*.jar    ./
COPY --from=backend-build --chown=nasfinance:nasfinance /build/target/quarkus-app/app/     ./app/
COPY --from=backend-build --chown=nasfinance:nasfinance /build/target/quarkus-app/quarkus/ ./quarkus/

USER nasfinance

EXPOSE 8080

# Ajuste de JVM para hardware modesto:
#
# MaxRAMPercentage=65  - a JVM le o limite de memoria DO CONTAINER (definido
#                        no compose) e usa 65% dele como heap maximo. Sem isso
#                        ela enxergaria os 3,2GB do host inteiro e tentaria
#                        reservar heap demais, levando o kernel a matar o
#                        processo por OOM.
# UseSerialGC          - coletor de pausa curta e footprint minimo. Os
#                        coletores paralelos criam threads por CPU e reservam
#                        estruturas auxiliares que so compensam com heap
#                        grande e varios nucleos.
# TieredStopAtLevel=1  - compilacao JIT so ate C1. Perde pico de desempenho em
#                        troca de menos CPU e menos memoria de compilacao —
#                        vantajoso num app pessoal de baixo trafego.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=65 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Djava.util.logging.manager=org.jboss.logmanager.LogManager"

# `exec` faz o java virar o PID 1, recebendo SIGTERM diretamente do
# `docker stop`. Sem ele, o shell seria o PID 1, engoliria o sinal, e o
# container so morreria depois do timeout de 10s — encerrando conexoes
# no meio e podendo interromper uma transacao do banco.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/quarkus-run.jar"]
