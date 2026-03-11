type PlantUmlEncoder = {
    encode: (source: string) => string;
};

const plantUmlEncoder = require('plantuml-encoder') as PlantUmlEncoder;

const PLANTUML_SERVER_BASE_URL = 'https://www.plantuml.com/plantuml';

export function buildPlantUmlSvgUrl(source: string): string {
    return `${PLANTUML_SERVER_BASE_URL}/svg/${plantUmlEncoder.encode(source)}`;
}
