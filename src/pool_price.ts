import fs from 'fs';
import readline from 'readline';
import { parse } from 'date-and-time';


const filePath = './data/sahkon-hinta-010121-060225.csv';
const energyFilePath = './data/Kulutusraportti_tunti_2024_2023.csv';
// const filePath = './data/sahkon-hinta-010121-060225_short.csv';
// const energyFilePath = './data/Kulutusraportti_tunti_2024_short.csv';

const priceMargin = 0.5; // 0.5 cents

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