import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
      return NextResponse.json(
        { error: 'Latitude and longitude are required' },
        { status: 400 }
      );
    }

    // OpenWeatherMap API - You'll need to get a free API key from https://openweathermap.org/api
    // For now, using a placeholder. Replace with actual API key or use environment variable
    const apiKey = process.env.OPENWEATHER_API_KEY || 'demo';

    // If no API key is set, return mock data for testing
    if (apiKey === 'demo') {
      return NextResponse.json({
        location: `${parseFloat(lat).toFixed(2)}°, ${parseFloat(lon).toFixed(2)}°`,
        weather: 'Clear Sky',
        temperature: 22,
        feelsLike: 21,
        humidity: 60,
        windSpeed: 3.5,
      });
    }

    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

    const response = await fetch(weatherUrl);

    if (!response.ok) {
      throw new Error('Failed to fetch weather data from OpenWeatherMap');
    }

    const data = await response.json();

    // Format the weather data
    const weatherData = {
      location: `${data.name || 'Unknown'}, ${data.sys?.country || ''}`,
      weather: data.weather?.[0]?.description || 'Unknown',
      temperature: Math.round(data.main?.temp || 0),
      feelsLike: Math.round(data.main?.feels_like || 0),
      humidity: data.main?.humidity || 0,
      windSpeed: data.wind?.speed || 0,
    };

    return NextResponse.json(weatherData);
  } catch (error) {
    console.error('Weather API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
