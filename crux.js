'use strict';

const BigQuery = require('@google-cloud/bigquery');
const babar = require('babar');


/* list of website to retrieve information */
const origins = [
    'https://www.cdiscount.com',
    'https://www.rueducommerce.fr'
];
const projectId = 'crux-analysis';
const table = "chrome-ux-report.country_fr.201805";

const OUTPUT_GREEN = '\x1b[32m';
const OUTPUT_BOLD = '\x1b[1m';
const OUTPUT_RESET = '\x1b[22m\x1b[39m';


const bigquery = new BigQuery({ projectId: projectId });
const query = ["#standardSQL",
    "SELECT ",
    "bin.start, SUM(bin.density) AS density",
    "FROM ",
    "`" + table + "` , UNNEST(first_contentful_paint.histogram.bin) AS bin",
    "WHERE ",
    "origin = @origin",
    "GROUP BY    bin.start",
    "ORDER BY    bin.start"
].join("\n");


/* add extra point to improve babar display */
function prettifyData(progress, duration) {
    let data = [];
    let i = 0;
    let lastValue = progress[0][0];
    for (let step = 0; step < progress.length; step++) {
        while (i < progress[step][0]) {
            data.push([i, lastValue]);
            i += 100;
        }
        lastValue = progress[step][1];
    }
    for (;i < duration || i % 1000 != 0; i+= 100) {
        data.push([i, lastValue]);
    }
    data.push([i, lastValue]);
    return data;
}

function display(origin, percentile, delta, data, duration, maxY) {
    const green = (content) => OUTPUT_GREEN + content + OUTPUT_RESET;
    const bold = (content) => OUTPUT_BOLD + content + OUTPUT_RESET;
    console.log([
        `${bold('Site     ')}: ${green(origin)}`,
        `${bold('Median   ')}: ${green(percentile[50] + ' ms')}`,
        `${bold('90 %     ')}: ${green(percentile[90] + ' ms')}`,
        '',
        `${bold('first contentful paint')}`
    ].join('\n'));
    console.log(babar(prettifyData(delta, duration), {grid:'blue', maxY: maxY, height: 11, width: 88}));
    console.log(babar(prettifyData(data, duration), {grid:'blue', maxY: 100, height: 12, width: 88}));
    console.log("\n");
}
origins.forEach(origin => {
    bigquery.query({
        query: query,
        params: {
            origin: origin
        }
    })
        .then(rows => {
            let data = [];
            let delta = [];
            let maxY = 10;
            let prev = 0;
            let duration = 0;
            let percentile = [];
            /* iterate on result to build an array of data to display
             * get the median and last 10 percentile
             * Clip to 98% or 6 seconds
             */
            rows[0].some(v => {
                let d = v.density * 100;
                duration = v.start;
                maxY = Math.max(maxY, d);
                delta.push([duration, d]);
                data.push([duration, prev]);
                prev += d;
                if (prev < 90) {
                    percentile[90] = duration;
                    if (prev < 50) {
                        percentile[50] = duration;
                    }
                }
                return prev > 98 || duration >= 6000;
            });
            display(origin, percentile, delta, data, duration, maxY);
        })
        .catch(err => {
            console.error('ERROR:', err);
        });;
});
