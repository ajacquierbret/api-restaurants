import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './scss/style.scss';
import * as _ from 'lodash';
import * as $ from 'jquery';
import * as restaurantsListJSON from '../json/restaurants.json';
import { Position, Restaurant } from './types/types';
import { createRestaurantMarker, getRestaurantAverageRating } from './utils/utils';

const localRestaurantsList = restaurantsListJSON;

//// Google Maps initialization

$('#main-infos').height(window.innerHeight);
$('#restaurants').height(window.innerHeight);

declare global {
    interface Window { initMap: () => void }
}

const mapElement: HTMLElement = document.getElementById('map');

const options: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 30000,
    timeout: 27000,
}
const error: PositionErrorCallback = () => console.debug("La position n'a pas pu être obtenue.");

let userPosition: Position;

const mapScript = document.createElement('script');
mapScript.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyCpx26o2E4K28ETHnFC2ufBaVjgKGVU9yo&callback=initMap';
mapScript.async = true;
mapScript.defer = true;


//// Streetview images handling

const getStreetViewImage = ({ lat, lng }: Position): HTMLImageElement => {
    const streetViewImage = new Image();
    streetViewImage.classList.add('img-fluid')
    const request = `https://maps.googleapis.com/maps/api/streetview?size=300x200&location=${lat},${lng}&pitch=0&key=AIzaSyCpx26o2E4K28ETHnFC2ufBaVjgKGVU9yo`
    fetch(request).then((res) => {
        return res.blob();
    }).then((res) => {
        const URLobject = URL.createObjectURL(res);
        streetViewImage.src = URLobject;
    })
    return streetViewImage;
}

const restaurantsImages: {
    name: string;
    image: HTMLImageElement;
}[] = [];

localRestaurantsList.forEach(restaurant => {
    restaurantsImages.push({
        name: restaurant.restaurantName,
        image: getStreetViewImage({ lat: restaurant.lat, lng: restaurant.long }),
    })
});



const userRatingStringLiteral = (idSuffix: string) => `
<div class="form-group mt-5" id="rating-form-${idSuffix}">
  <div class="input-group mb-3">
    <input class="form-control" min="0" max="5" type="number" placeholder="Ma note" />
    <div class="input-group-append">
      <span class="input-group-text">/5</span>
    </div>
  </div>
  <textarea class="form-control" type="text" placeholder="Mon avis"></textarea>
</div>
<button id="add-rating-button-${idSuffix}" class="btn btn-primary my-3">Noter</button>
`;

const placeholderListStringLiteral = `
<span class="text-muted text-center w-75 m-auto">Déplacez la carte pour afficher les restaurants proches de chez vous.</span>
`



//// Filters handling

const starFilter = {
    min: 0,
    max: 5,
}

const isBetweenFilters = (rating?: number) => {
    return rating >= starFilter.min && rating <= starFilter.max
}


//// Restaurants list and ratings

const ratingsListElement: JQuery<HTMLElement> = $('#ratings');
const restaurantsListElement: JQuery<HTMLElement> = $('#restaurants');
const restaurantItemClass = 'list-group-item ' + 'list-group-item-action ' + 'flex-column ' + 'align-items-start';

const resetDOMElements = (empty?: boolean) => {
    restaurantsListElement.empty();
    ratingsListElement.empty()
    if (empty) {
        $('#restaurants').height(window.innerHeight);
        restaurantsListElement.append(placeholderListStringLiteral)
    } else {
        $('#restaurants').height('100%');
    }
}

const fillRestaurantsLists = (restaurants: Restaurant[]) => {
    restaurants.forEach(restaurant => {
        restaurantsListElement.append(`
            <a href="#${restaurant.restaurantName}-tab" class="${restaurantItemClass}" id="${restaurant.restaurantName}-list" data-toggle="list" role="tab">
                <div class="d-flex justify-content-between">
                    <h5 class="mb-1">${restaurant.restaurantName}</h5>
                    <small>${getRestaurantAverageRating(restaurant.ratings)} / 5</small>
                </div>
                <small>${restaurant.address}</small>
            </a>
        `)
        ratingsListElement.append(`
            <div class="tab-pane w-75 m-auto fade show" role="tabpanel" aria-labelledby="${restaurant.restaurantName}-list" id="${restaurant.restaurantName}-tab"></div>
        `)
        $(`#${restaurant.restaurantName}-tab`).append(restaurantsImages.find(el => el.name === restaurant.restaurantName).image);
        restaurant.ratings.forEach(rating => {
            $(`#${restaurant.restaurantName}-tab`).append(`
                <div class="w-100 mt-5">
                    <div class="row">
                        <div class="col-4">
                            <h5 style="display: block; text-overflow: ellipsis; white-space: nowrap; overflow: hidden">${rating.stars} / 5</h5>
                        </div>
                        <div class="col">
                            <p class="text-muted">${rating.comment}</p>
                        </div>
                    </div>
                </div>
            `)
        })
        $(`#${restaurant.restaurantName}-tab`).append(userRatingStringLiteral(restaurant.restaurantName));
    })
}

const findNearestRestaurants = (restaurants: Restaurant[], map: google.maps.Map<Element>) => {
    console.log(restaurants);
    return restaurants.filter(restaurant => map.getBounds().contains({
        lat: restaurant.lat,
        lng: restaurant.long,
    }) && isBetweenFilters(getRestaurantAverageRating(restaurant.ratings)))
}

window.initMap = (): void => {
    if (navigator.geolocation) {

        let googleMap: google.maps.Map;

        const mapOptions: google.maps.MapOptions = {
            zoom: 15,
        }
        
        const userPositionDot = new google.maps.Marker({
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillOpacity: 1,
                strokeWeight: 2,
                fillColor: '#5384ED',
                strokeColor: '#FFFFFF',
            }
        });

        let nearestRestaurants: Restaurant[];
        let restaurantsMarkers: google.maps.Marker[] = [];

        const listenToMarkerInteraction = (marker: google.maps.Marker, restaurant: Restaurant) => {
            marker.addListener('click', () => {
                $(`#${restaurant.restaurantName}-list`).tab('show')
            });
        }

        const listenToRatingSubmit = (restaurant: Pick<Restaurant, 'restaurantName'>) => {
            $(`#add-rating-button-${restaurant.restaurantName}`).on('click', () => {
                const stars = Number($(`#rating-form-${restaurant.restaurantName} input`).val());
                const comment = $(`#rating-form-${restaurant.restaurantName} textarea`).val() as string;
                const rating = {
                    stars,
                    comment,
                };
                const targetRestaurant = localRestaurantsList.find(_ => _.restaurantName === restaurant.restaurantName);
                if (stars && comment.length) {
                    localRestaurantsList.map(_ => _ === targetRestaurant ? _.ratings.push(rating) : null);
                    updateRestaurants();
                    alert('Merci pour votre avis !');
                } else {
                    alert("Vous n'avez pas rempli correctement le formulaire");
                }
            })
        }

        // Put restaurants on map
        const fillRestaurantsMarkers = (restaurants: Restaurant[]) => {
            restaurantsMarkers.forEach(marker => {
                marker.setMap(null)
            });
            restaurantsMarkers = [];
            restaurants.forEach(restaurant => {
                const marker = createRestaurantMarker({
                    lat: restaurant.lat,
                    lng: restaurant.long,
                });
                restaurantsMarkers.push(marker)
                listenToMarkerInteraction(marker, restaurant)
            });
            restaurantsMarkers.forEach(marker => {
                marker.setMap(googleMap)
            });
        };

        const updateRestaurants = () => {
            nearestRestaurants = findNearestRestaurants(
                localRestaurantsList as Restaurant[],
                googleMap,
            );
            resetDOMElements(nearestRestaurants.length === 0);
            fillRestaurantsLists(nearestRestaurants);
            fillRestaurantsMarkers(nearestRestaurants);
            nearestRestaurants.forEach(restaurant => listenToRatingSubmit(restaurant));
        };

        navigator.geolocation.watchPosition((position) => {
            // Put user on the map
            userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            googleMap = new google.maps.Map(mapElement, {
                center: userPosition,
                ...mapOptions,
            });
            userPositionDot.setMap(googleMap);
            userPositionDot.setPosition(userPosition);

            // Listen to bounds changes
            googleMap.addListener('bounds_changed', () => {
                updateRestaurants()
            });

            // Listen to filters change
            $('#min-stars').on('change', () => {
                starFilter.min = $('#min-stars').val() as number;
                updateRestaurants();
            });
            $('#max-stars').on('change', () => {
                starFilter.max = $('#max-stars').val() as number;
                updateRestaurants();
            });
        }, error, options);
  };
}

// Main initialization
document.head.appendChild(mapScript);