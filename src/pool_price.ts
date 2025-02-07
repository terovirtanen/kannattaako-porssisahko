import fs from 'fs';
import readline from 'readline';
import { parse } from 'date-and-time';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration, Chart } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';

// Register the annotation plugin
Chart.register(annotationPlugin);

const filePath = './data/sahkon-hinta-010121-060225.csv';
const energyFilePath = './data/Kulutusraportti_tunti_2024_2023.csv';
// const filePath = './data/sahkon-hinta-010121-060225_short.csv';
// const energyFilePath = './data/Kulutusraportti_tunti_2024_short.csv';

const priceMargin = 0.5; // 0.5 cents
const priceFixed = 0.08; // 0.08 euros

const readPriceCSV = async (filePath: string) => {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const data: { date: Date, price: number | undefined, energy: number | undefined, totalCost?: number }[] = [];

    for await (const line of rl) {
        const [date, price] = line.split(';');
        const formattedDate = parse(date, 'DD/MM/YYYY HH:mm:ss');
        formattedDate.setMinutes(0, 0, 0);
        const formattedPrice = parseFloat(price.replace(',', '.').replace('−', '-')); // Replace non-standard minus sign
        data.push({ date: formattedDate, price: formattedPrice, energy: undefined });
    }

    return data;
};

const readEnergyCSV = async (filePath: string, data: { date: Date, price: number | undefined, energy: number | undefined, totalCost?: number }[]) => {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const [date, energyValue] = line.split(';');
        const formattedDate = parse(date, 'D.M.YYYY HH:mm');
        formattedDate.setMinutes(0, 0, 0);
        const formattedEnergyValue = parseFloat(energyValue.replace(',', '.'));
        const entry = data.find(entry => entry.date.getTime() === formattedDate.getTime());
        if (entry) {
            entry.energy = formattedEnergyValue;
        } else {
            data.push({ date: formattedDate, price: undefined, energy: formattedEnergyValue });
        }
    }

    data.forEach(entry => {
        if (entry.price !== undefined && entry.energy !== undefined) {
            entry.totalCost = parseFloat((((entry.price + priceMargin)* entry.energy) / 100).toFixed(2)); // Convert cents to euros
        }
    });
};

const generateReports = (data: { date: Date, price: number | undefined, energy: number | undefined, totalCost?: number }[]) => {
    const monthlyReport: { [key: string]: { totalEnergy: number, totalCost: number } } = {};
    const yearlyReport: { [key: string]: { totalEnergy: number, totalCost: number } } = {};
    const winterMonths = [0, 1, 2, 3, 9, 10, 11]; // January, February, March, October, November, December
    const winterSummary: { [key: string]: { totalEnergy: number, totalCost: number } } = {};

    data.forEach(entry => {
        if (entry.totalCost !== undefined && entry.price !== undefined && entry.energy !== undefined) {
            const monthYear = entry.date.toLocaleString(undefined, { year: 'numeric', month: 'long' });
            const year = entry.date.getFullYear().toString();
            const month = entry.date.getMonth();

            if (!monthlyReport[monthYear]) {
                monthlyReport[monthYear] = { totalEnergy: 0, totalCost: 0 };
            }
            monthlyReport[monthYear].totalEnergy += entry.energy;
            monthlyReport[monthYear].totalCost += entry.totalCost;

            if (!yearlyReport[year]) {
                yearlyReport[year] = { totalEnergy: 0, totalCost: 0 };
            }
            yearlyReport[year].totalEnergy += entry.energy;
            yearlyReport[year].totalCost += entry.totalCost;

            if (winterMonths.includes(month)) {
                if (!winterSummary[year]) {
                    winterSummary[year] = { totalEnergy: 0, totalCost: 0 };
                }
                winterSummary[year].totalEnergy += entry.energy;
                winterSummary[year].totalCost += entry.totalCost;
            }
        }
    });

    console.log('Monthly Report:');
    for (const monthYear in monthlyReport) {
        console.log(`Month: ${monthYear}, Total Energy: ${monthlyReport[monthYear].totalEnergy.toFixed(2)} kWh, Total Cost: €${monthlyReport[monthYear].totalCost.toFixed(2)}, Average Price: €${(monthlyReport[monthYear].totalCost / monthlyReport[monthYear].totalEnergy).toFixed(3)}`);
    }

    console.log('Yearly Report:');
    for (const year in yearlyReport) {
        console.log(`Year: ${year}, Total Energy: ${yearlyReport[year].totalEnergy.toFixed(2)} kWh, Total Cost: €${yearlyReport[year].totalCost.toFixed(2)}, Average Price: €${(yearlyReport[year].totalCost / yearlyReport[year].totalEnergy).toFixed(3)}`);
    }

    console.log('Winter Summary:');
    for (const year in winterSummary) {
        console.log(`Year: ${year}, Total Energy: ${winterSummary[year].totalEnergy.toFixed(2)} kWh, Total Cost: €${winterSummary[year].totalCost.toFixed(2)}, Average Price: €${(winterSummary[year].totalCost / winterSummary[year].totalEnergy).toFixed(3)}`);
    }

    createDiagrams(monthlyReport, yearlyReport);
};

const createDiagrams = (monthlyReport: { [key: string]: { totalEnergy: number, totalCost: number } }, yearlyReport: { [key: string]: { totalEnergy: number, totalCost: number } }) => {
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 600, backgroundColour: 'white' });

    const monthlyLabels = Object.keys(monthlyReport);
    const monthlyAveragePrices = monthlyLabels.map(label => parseFloat((monthlyReport[label].totalCost / monthlyReport[label].totalEnergy).toFixed(3)));
    const monthlyChartConfig: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: {
            labels: monthlyLabels,
            datasets: [{
                label: 'Monthly Average Price (€)',
                data: monthlyAveragePrices,
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: priceFixed,
                            yMax: priceFixed,
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 2,
                            label: {
                                content: 'Fixed Price (€0.08)',
                                enabled: true,
                                position: 'end'
                            }
                        }
                    }
                }
            }
        }
    };

    const yearlyLabels = Object.keys(yearlyReport);
    const yearlyAveragePrices = yearlyLabels.map(label => parseFloat((yearlyReport[label].totalCost / yearlyReport[label].totalEnergy).toFixed(3)));
    const yearlyChartConfig: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: {
            labels: yearlyLabels,
            datasets: [{
                label: 'Yearly Average Price (€)',
                data: yearlyAveragePrices,
                backgroundColor: 'rgba(153, 102, 255, 0.2)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: priceFixed,
                            yMax: priceFixed,
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 2,
                            label: {
                                content: 'Fixed Price (€0.08)',
                                enabled: true,
                                position: 'end'
                            }
                        }
                    }
                }
            }
        }
    };

    chartJSNodeCanvas.renderToBuffer(monthlyChartConfig)
        .then(buffer => fs.writeFileSync('./reports/monthly_report.png', buffer))
        .catch(err => console.error('Error creating monthly chart:', err));

    chartJSNodeCanvas.renderToBuffer(yearlyChartConfig)
        .then(buffer => fs.writeFileSync('./reports/yearly_report.png', buffer))
        .catch(err => console.error('Error creating yearly chart:', err));
};

const processFiles = async () => {
    try {
        const data = await readPriceCSV(filePath);
        await readEnergyCSV(energyFilePath, data);
        const filteredData = data.filter(entry => entry.price !== undefined && entry.energy !== undefined);
        // filteredData.forEach(entry => {
        //     const shortDate = new Date(entry.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short', hour12: false });
        //     console.log(`Date: ${shortDate}, Price: ${entry.price}, Energy: ${entry.energy}, Total Cost: €${entry.totalCost}`);
        // });
        generateReports(filteredData);
    } catch (error) {
        console.error(error);
    }
};

processFiles();