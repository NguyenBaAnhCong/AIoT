FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /source
COPY tv5-java/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY tv5-java/src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app/tv5-java
COPY --from=build /source/target/tv5-java-1.0.0.jar app.jar
EXPOSE 4005
ENTRYPOINT ["java","-jar","app.jar","--server.address=0.0.0.0"]
