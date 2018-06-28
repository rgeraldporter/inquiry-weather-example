const ecweather = require('ec-weather');
const {Inquiry, Pass, Fail} = require('inquiry-monad');
const R = require('ramda');
const { Maybe } = require('simple-maybe');
const express = require('express');
const app = express();

// a few Southern Ontario examples...
// use the EC website to find other places, e.g.,
// https://weather.gc.ca/city/pages/on-82_metric_e.html --> on-82 = Kitchener-Waterloo
const places = {
  Hamilton: 'on-77',
  Brantford: 'on-86',
  Burlington: 'on-95',
  Oakville: 'on-79',
  Haldimand: 'on-42',
  Lincoln: 'on-47',
  'St. Catharines': 'on-107'
};

app.use(express.static('public'));

const getWarnings = a =>
  a.entries.filter(item => item.type === 'Warnings and Watches')[0];

const getCurrentConditions = a =>
  a.entries.filter(item => item.type === 'Current Conditions')[0];

const findZeroBelow = a =>
  a.entries.filter(item => item.type === 'Weather Forecasts')
    .filter(item => item.title.includes('night'))
    .map(item => item.summary.match( /(?<=Low )(-?)[0-9][0-9]/ ))
    .map(R.head)
    .map(Number)
    .filter(x => x <= 0);

const find30Above = a =>
  a.entries.filter(item => item.type === 'Weather Forecasts')
    .filter(item => !item.title.includes('night'))
    .map(item => item.summary.match( /(?<=High )(-?)[0-9][0-9]/ ))
    .map(R.head)
    .map(Number)
    .filter(x => x > 30);

const findHumidex35Above = a =>
  a.entries.filter(item => item.type === 'Weather Forecasts')
    .filter(item => !item.title.includes('night'))
    .map(item =>
         // if no values, let's return one with a zero so it can be processed
         Maybe.of(item.summary.match( /(?<=Humidex )(-?)[0-9][0-9]/ ))
           .fork(x => [0], y =>
                y.length ? y : [0])
    )
    .map(R.head)
    .map(Number)
    .filter(x => x > 35);

const forecastAboveZero = a =>
  findZeroBelow(a).length
    ? Fail('❄️Freezing temperatures are present in forecast')
    : Pass('😎All forecasts above freezing');

const forecastAbove30 = a =>
  find30Above(a).length
    ? Fail('🔥Temperatures above 30°C in the forecast')
    : Pass('😌No forecasts above 30°C');

const humidexAbove35 = a =>
  findHumidex35Above(a).length
    ? Fail('😓Humidex above 35 in the forecast')
    : Pass('😌No humidex above 35 in the forecast');

const checkWarnings = a =>
  getWarnings(a).inEffect
    ? Fail(`⚠️${getWarnings(a).summary}`)
    : Pass('👍No watches or warnings in effect');

const airQualityBelow5 = a =>
  Number(getCurrentConditions(a).airQualityHealthIndex) < 5
    ? Pass('👍Air quality index is below 5, generally fine for most individuals')
    : Fail('👎Air quality index is 5 or higher, reduce outdoor activity levels if in an at-risk group');

app.get("/", function (request, response) {
  
  return ecweather({
    lang: 'en',
    city: places['Hamilton'], // change this to whichever location you want in Canada
  })
  //.then(console.log)
  .then(results =>
      Inquiry.subject(results)
        .inquire(forecastAboveZero)
        .inquire(forecastAbove30)
        .inquire(humidexAbove35)
        .inquire(checkWarnings)
        .inquire(airQualityBelow5)
        .join()
  )
  .then(data =>
    response.render(__dirname + '/views/weather.ejs', {data})
  )
  .catch(console.error);
});

const listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});


