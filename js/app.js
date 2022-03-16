var protocol;

if (window.location.protocol == "https:") {
  protocol = "https";
} else {
  protocol = "http";
}

require(["esri/Map","esri/Color", "esri/layers/GraphicsLayer", "esri/geometry/projection",
         "esri/geometry/Extent", "esri/views/MapView", "esri/geometry/support/webMercatorUtils",
         "esri/Graphic", "esri/tasks/support/BufferParameters", 
         "esri/tasks/GeometryService", "esri/geometry/geometryEngine", 
         "esri/geometry/SpatialReference", "esri/layers/FeatureLayer", 
         "esri/layers/MapImageLayer", "esri/widgets/BasemapToggle", 
         "esri/renderers/SimpleRenderer", "esri/tasks/IdentifyTask", 
         "esri/tasks/support/IdentifyParameters", "esri/geometry/geometryEngine", 
         "esri/geometry/Polygon", "esri/tasks/QueryTask", "esri/tasks/support/Query", 
         "esri/renderers/SimpleRenderer"],  function (Map, Color, GraphicsLayer, projection, Extent, MapView, webMercatorUtils,
            Graphic, BufferParameters,
            GeometryService, geometryEngine, SpatialReference, FeatureLayer, 
            MapImageLayer, BasemapToggle, SimpleRenderer, IdentifyTask, 
            IdentifyParameters, geometryEngine, Polygon, QueryTask, Query, SimpleRenderer) {

  var SearchCtrl = function () {
    var GEOCODER_URL = protocol + '://sfplanninggis.org/cpc_geocode/?search=';
    var mapServiceUrl = protocol + '://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer/'
    var addressFromGeocoder = '';
    return {
      getAddressFromGeocoder: function() {
        return addressFromGeocoder;
      },

      setAddressString: function(str) {
        addressFromGeocoder = str;
      },

      getGeocoderResponse: function (searchString) {
        var geocodeUrl = GEOCODER_URL + searchString;
        return $.get(geocodeUrl)
          .then(function (response) {
            return response;
          });
      },

      getSearchByAddressResponsePromise: function (searchString) {
        var capitalizeSearchString = searchString.toUpperCase().trim();
        var layerNumMappings = MapCtrl.getLayerNumMapping();
        var cannabisLayerNum = layerNumMappings.cannabisLocationsLayerNum;
        var queryPromise;

        var cannabisLayerMapService = mapServiceUrl + cannabisLayerNum;

        var itemsToRemoveFromAddress = [', SF', ', SAN FRANCISCO, CA', ', SAN FRANCISCO CA', ' SAN FRANCISCO CA', ', CALIFORNIA',
          ', CA', ',', ' SAN FRANCISCO CA', ' SAN FRANCISCO', ' STREET', ' SF'];

        itemsToRemoveFromAddress.forEach(function (item) {
          capitalizeSearchString = capitalizeSearchString.replace(item, '');
        });

        capitalizeSearchString = capitalizeSearchString.replace("'", "");
        
        var queryTask = new QueryTask(cannabisLayerMapService);
        var query = new Query();
        query.where = "upper(address) LIKE '" + capitalizeSearchString + "%'";
        query.returnGeometry = true;
        query.outFields = ["*"];
        queryPromise = queryTask.execute(query);
        return queryPromise;
      },

      getSearchByStoreNameResponsePromise: function (searchString, searchAddress, searchType, objectId) {
        var promise;
        var layerNumMappings = MapCtrl.getLayerNumMapping();
        var cannabisLayerNum = layerNumMappings.cannabisLocationsLayerNum;
        var capitalizeSearchString = searchString.toUpperCase().trim();
        capitalizeSearchString = capitalizeSearchString.replace("'", "''");
        var cannabisLayerMapService = mapServiceUrl + cannabisLayerNum;
        var queryTask = new QueryTask(cannabisLayerMapService);
        var query = new Query();

        if (searchType === 'findByExactMatch') {
          // query.where = "upper(dba_name) = '" + capitalizeSearchString + "' AND address = '" + searchAddress + "'";
          query.where = "OBJECTID =" + objectId
        }
        else {
          query.where = "upper(dba_name) LIKE '%" + capitalizeSearchString + "%'";
        }
        query.returnGeometry = true;
        query.outFields = ["*"];
        promise = queryTask.execute(query);
        return promise;
      },

      checkIfParcelIsMcd: function (parcelStr) {
        var promise;
        var layerNumMappings = MapCtrl.getLayerNumMapping();
        var mcdLayerNum = layerNumMappings.mcdLayerNum;
        var mcdLayerMapService = mapServiceUrl + mcdLayerNum;
        var queryTask = new QueryTask(mcdLayerMapService);
        var query = new Query();

        query.where = "mapblklot = '" + parcelStr + "'";
        query.returnGeometry = true;
        query.outFields = ["*"];
        promise = queryTask.execute(query);
        return promise;
      },

      searchParcelIsCannabisPermit: function (parcelNumString) {
        var promise;
        var layerNumMappings = MapCtrl.getLayerNumMapping();
        var cannabisLayerNum = layerNumMappings.cannabisLocationsLayerNum;
        var cannabisLayerUrl = mapServiceUrl + '/' + cannabisLayerNum;
        var queryTask = new QueryTask(cannabisLayerUrl);
        var query = new Query();
        query.where = "parcelToGeocode = '" + parcelNumString + "'"; 0
        query.returnGeometry = true;
        query.outFields = ["*"];
        promise = queryTask.execute(query);
        return promise;
      },
    }
  }();



  var PopupCtrl = function () {
    var isOnMultipleLocationView = false;
    var popupsForSearch;
    var clickedOnMulpleLocationAlready = false;


    return {
      getIsOnMultipleView: function () {
        return isOnMultipleLocationView;
      },

      setPopupForSearch: function(arrayOfPopups) {
        popupsForSearch = arrayOfPopups;
      },

      getPopupForSearch: function() {
        return popupsForSearch;
      },

      setIsOnMultipleView: function (bool) {
        isOnMultipleLocationView = bool;
      },

      setClickedOnMultiLocation: function(bool) {
        clickedOnMulpleLocationAlready = bool;
      },

      clickedOnMultiLocationAlready: function() {
        return clickedOnMulpleLocationAlready;
      }


      
    }
  }();

  var MapCtrl = function () {

    var CANNABIS_RETAIL_SERVICE_URL =  
      protocol + '://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer';
    var map, view;
    var mapImageLayer;
    var cannabisPermitedLayer, cannabisPermittedWithCuLayer, cannabisPermittedWithMicrobusinessLayer, supervisorLayer,
    nHoodFeatureLayer;

    var CANNABIS_PERMITTED_LAYER_NUM, CANNABIS_PERMITTED_WITHCU_LAYER_NUM, CANNABIS_PERMITTED_WITH_MICROBUSINESS_LAYER_NUM;

    var polygonLayerAddedToMap;

    var mcdLayerNum, schoolLayerNum;
    var mcdBufferLayerNum, schoolBufferLayerNum;
    var onHoldBuffLayerNum, processBuffLayerNum, submittedBuffLayerNum, approvedBuffLayerNum, underConstructionBuffLayerNum;
    var onHoldLayerNum, processLayerNum, submittedLayerNum, approvedLayerNum, underConstructionLayerNum;
    var supervisorDistLayerNum;
    var cannabisLocationsLayerNum;
    var parcelLabelLayerNum;
    var popupItemsArr;
    var listOfItemsInsideSearchBuffer;
    var currPopupLocation;

    var submittedCannabisLayer;
    var neighborhoodLayerOn = false;
    var supervisorLayerOn = false;

    var nHoodLayerUrl = '';

    // used to allow and disallow clicking on map when distirct layer is on
    var allowIdentifyOnPermits = true;
    var initialDistrictSelection = undefined;
    var initialNHoodSelection = undefined;
    var allowResetOfInitialDistrict = true;

    var graphicLayerForNHoodAndDistrct = new GraphicsLayer();
    var nHoodGraphicLayers = new GraphicsLayer();

    var cannabisRetailLayerMapToNumber = {
      approvedBuffLayerNum: '',
      underConstructionBuffLayerNum: '',
      submittedBuffLayerNum: '',
      processBuffLayerNum: '',
      onHoldBuffLayerNum: '',
      CANNABIS_PERMITTED_LAYER_NUM: '',
      CANNABIS_PERMITTED_WITHCU_LAYER_NUM: '',
      CANNABIS_PERMITTED_WITH_MICROBUSINESS_LAYER_NUM: '',
      mcdLayerNum: '',
      mcdBufferLayerNum: '',
      schoolLayerNum: '',
      schoolBufferLayerNum: '',
      supervisorDistLayerNum: '',
      onHoldLayerNum: '',
      processLayerNum: '',
      submittedLayerNum: '',
      underConstructionLayerNum: '',
      approvedLayerNum: '',
      cannabisLocationsLayerNum: '',
      parcelLabelLayerNum: '',
      neighborhoodLayerNum: ''
    }

    var allLayerNames = {
      cannabisOnHoldPermitName: 'CannabisRetail - CannabisLocations OOC - On Hold',
      cannabisProcessingPermitName: 'CannabisRetail - CannabisLocations OOC - Processing',
      cannabisSubmittedPermitName: 'CannabisRetail - CannabisLocations OOC - Submitted',
      cannabisApprovedPermitName: 'CannabisRetail - CannabisLocations OOC - Approved',
      cannabisUnderConstructionPermitName: 'CannabisRetail - CannabisLocations OOC - Under Construction',
      mcdName: 'CannabisRetail - MCDs',
      schoolName: 'CannabisRetail - SchoolsPublicPrivateDec2015 KThru12'
    }

    var polygonColoringForInputSearch = {
      type: 'simple-fill',
      color: [146, 148, 150, 0.25],
      style: 'solid',
      outline: {
        color: [79, 102, 238, 1],
        width: 2
      }
    };

    var polygonRenderer = new SimpleRenderer({
      symbol: polygonColoringForInputSearch
    });

    var supervisorLabeling = {
      symbol: {
        type: 'text',
        color: 'black',
        font: {
          family: 'arial',
          size: 15,
          weight: 'bold'
        }
      },
      backgroundColor: new Color('#00FF00'),
      borderLineColor: new Color('red'),
      borderLineSize: 14,
      labelExpressionInfo: {
        expression: "$feature.supervisor"
      }
    }

    map = new Map({
      basemap: 'gray-vector'
    });



    view = new MapView({
      container: 'map',
      map: map,
      center: [-122.45, 37.76],
      zoom: 12,
      highlightOptions: {
        color: [79,102,238, 1],
        fillOpacity: 0.1,
        haloColor: [79,102,238, 1]
      }
    });

    map.basemap.thumbnailUrl = 'images/Globe-bkg.svg'

    mapImageLayer = new MapImageLayer({
      url: CANNABIS_RETAIL_SERVICE_URL,
    });

    var basemapToggle = new BasemapToggle({
      view: view,
      nextBasemap: "hybrid"
    });

    view.when(function () {
      view.on('click', executeIdentifyTask);
      view.watch("popup.visible", function (newVal, oldVal) {
        if (popupItemsArr && popupItemsArr.length > 1) {
          UICtrl.changePopupFooterColor();
        }
        // view.popup.currentDockPosition = "top-left"
        if (newVal === true) {
          if (App.isOnMobile()) {
            UICtrl.changeMapHeightAndHandleTabDisplay(newVal);
            UICtrl.changePopFooterForMobile();
            UICtrl.changeMobileTabsToNonActiveColors();
          }
        }
        view.popup.collapsed = false;
      });

    });

    function handleHighLightingLayer(layer) {
      // Disable hover over map if on mobile
      var windowWidth = window.innerWidth;
      if (windowWidth < 769) {
        return;
      }
      var layerToCheck;
      var attributeToCheck;
      if (supervisorLayerOn) {
        layerToCheck = supervisorLayer;
        attributeToCheck = 'supervisor';
      } else if (neighborhoodLayerOn) {
        layerToCheck = nHoodLayer;
        attributeToCheck = 'NEIGHBORHOOD';
      }
      view.whenLayerView(layer)
      .then(function(layerView) {
        view.on("pointer-move", eventHandler);
        function eventHandler(event) {
          view.hitTest(event).then(getGraphics)
        }

        var highlight, currAttributeVal;
        function getGraphics(response) {
          changeCursor(response)
          if (response.results.length > 1) {

            var graphic = response.results.filter(function(result) {
              return result.graphic.layer === layerToCheck;
            })[0].graphic;
            var attributes = graphic.attributes;
            var attributeVal = attributes[attributeToCheck];
            
            if (attributeToCheck === 'supervisor') {
              if (Number(attributeVal) !== Number(initialDistrictSelection)) {
                allowIdentifyOnPermits = false;
                view.highlightOptions.fillOpacity =  0.1;

              } else {
                allowIdentifyOnPermits = true;
                view.highlightOptions.fillOpacity =  0;

              }
            } else if (attributeToCheck === 'NEIGHBORHOOD') {
              if (attributeVal !== initialNHoodSelection) {
                allowIdentifyOnPermits = false
                view.highlightOptions.fillOpacity =  0.1;

              } else {
                allowIdentifyOnPermits = true;
                view.highlightOptions.fillOpacity =  0;

              }
            }


            if (
              highlight &&
              (currAttributeVal !== attributeVal)
            ) {

              highlight.remove();
              highlight = null;

              return;
            }
            if (highlight) {
              if (initialNHoodSelection || initialDistrictSelection) {
              }
              return;
            }

            var query = layerView.createQuery();
            if (supervisorLayerOn) {
              query.where = attributeToCheck + " = " + attributeVal;
            }

            if (neighborhoodLayerOn) {
              query.where = attributeToCheck + " = " + "'" + attributeVal + "'";
            }
            layerView.queryObjectIds(query).then(function(ids) {
              if (highlight) {
                highlight.remove();
              }
              highlight = layerView.highlight(ids);
              currAttributeVal = attributeVal;
              view.highlightOptions.fillOpacity =  0.1;
            });
          } else {
            highlight.remove();
            highlight = null;
          }
        }
      })
    }

    function changeCursor(response) {
      if (response.results.length > 1){
        document.getElementById("map").style.cursor = "pointer";
      } else {
        document.getElementById("map").style.cursor = "default";
      }
    }

    function getHandCursorOnMap() {
      document.getElementById("map").style.cursor = "pointer";
    }

    function getDefaultCursorOnMap() {
      document.getElementById("map").style.cursor = "default";
    }

    view.ui.add(basemapToggle, "top-right");
    mapImageLayer.when(function () {
      var OPACITY_65 = 0.65;
      var OPACITY_50 = 0.50;
      var OPACITY_FOR_ZONING_LAYERS = 0.50;

      var zoningLayersForOpacity = ['Permitted', 'PermittedWithCU', 'PermittedWithMicrobusiness']

      var layersWithOpacity65 = [
        'CannabisLocations_OOC_600ft_Buffer - Submitted',
        'CannabisLocations_OOC_600ft_Buffer - Processing',
        'CannabisLocations_OOC_600ft_Buffer - Under Construction',
        'CannabisLocations_OOC_600ft_Buffer - Approved',
        'SchoolsPublicPrivateDec2015_600ftBuffer_KThru12',
        'MCD_600ftBuffer',
        'CannabisLocations_OOC_600ft_Buffer - On Hold'
      ];

      var layersWithOpacity50 = [
      ]

      var layersToTurnOn = [
        'CannabisLocations_OOC - On Hold',
        'CannabisLocations_OOC - Processing',
        'CannabisLocations_OOC - Submitted',
        'CannabisLocations_OOC - Approved',
        'CannabisLocations_OOC - Under Construction',
        'CannabisLocations_OOC_600ft_Buffer - On Hold',
        'CannabisLocations_OOC_600ft_Buffer - Processing',
        'CannabisLocations_OOC_600ft_Buffer - Submitted',
        'CannabisLocations_OOC_600ft_Buffer - Approved',
        'CannabisLocations_OOC_600ft_Buffer - Under Construction'
      ];

      mapImageLayer.sublayers.items.forEach(function (layer) {

        var layerTitle = layer.title;
        if (layersToTurnOn.indexOf(layerTitle) !== -1) {
          layer.visible = true;
        }

        if (layersWithOpacity65.indexOf(layerTitle) !== -1) {
          layer.opacity = OPACITY_65;
        } else if (zoningLayersForOpacity.indexOf(layerTitle) !== -1) {
          layer.opacity = OPACITY_FOR_ZONING_LAYERS;
        } 
      })

      assignLayerNumbersBasedOnNames(mapImageLayer);
  
      supervisorLayer = new FeatureLayer({
        url: CANNABIS_RETAIL_SERVICE_URL + '/' + 
        cannabisRetailLayerMapToNumber.supervisorDistLayerNum,
        labelingInfo: [supervisorLabeling],
        id: 'supervisor-layer'
      });

      nHoodLayer = new FeatureLayer({
        url: CANNABIS_RETAIL_SERVICE_URL + '/' + 
        cannabisRetailLayerMapToNumber.neighborhoodLayerNum,
        id: 'neighborhood-layer'
      })

      cannabisPermitedLayer = new FeatureLayer({
        url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_LAYER_NUM
      });

      cannabisPermittedWithCuLayer = new FeatureLayer({
        url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_WITHCU_LAYER_NUM
      });

      cannabisPermittedWithMicrobusinessLayer = new FeatureLayer({
        url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_WITH_MICROBUSINESS_LAYER_NUM
      });

      submittedCannabisLayer = new FeatureLayer({
        url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.submittedBuffLayerNum
      })
      submittedCannabisLayer.opacity = 0.50;
    });

    // map.add(submittedCannabisLayer)
    map.add(mapImageLayer);
    map.add(graphicLayerForNHoodAndDistrct);
    // map.add(nHoodGraphicLayers);

    function createElementWithClassName(elementType, className) {
      var element = document.createElement(elementType);
      element.setAttribute('class', className);
      return element;
    }

    function addGraphic(response) {
      var numOfResults = response.results;
      if (numOfResults.length > 1) {
      }
    }


    function assignLayerNumbersBasedOnNames(mapService) {
      var allLayers = mapService.sublayers.items;
      allLayers.forEach(function (eachLayer) {
        var currLayerId = eachLayer.id;

        switch (eachLayer.title) {
          case 'CannabisLocations_OOC_600ft_Buffer - Approved':
            cannabisRetailLayerMapToNumber.approvedBuffLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC_600ft_Buffer - Under Construction':
            cannabisRetailLayerMapToNumber.underConstructionBuffLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC_600ft_Buffer - Submitted':
            cannabisRetailLayerMapToNumber.submittedBuffLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC_600ft_Buffer - Processing':
            cannabisRetailLayerMapToNumber.processBuffLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC_600ft_Buffer - On Hold':
            cannabisRetailLayerMapToNumber.onHoldBuffLayerNum = currLayerId;
            break;
          case 'Permitted':
            cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_LAYER_NUM = currLayerId;
            break;
          case 'PermittedWithCU':
            cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_WITHCU_LAYER_NUM = currLayerId;
            break;
          case 'PermittedWithMicrobusiness':
            cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_WITH_MICROBUSINESS_LAYER_NUM = currLayerId;
            break;
          case 'MCDs':
            cannabisRetailLayerMapToNumber.mcdLayerNum = currLayerId;
            break;
          case 'MCD_600ftBuffer':
            cannabisRetailLayerMapToNumber.mcdBufferLayerNum = currLayerId;
            break;
          case 'SchoolsPublicPrivateDec2015_KThru12':
            cannabisRetailLayerMapToNumber.schoolLayerNum = currLayerId;
            break;
          case 'SchoolsPublicPrivateDec2015_600ftBuffer_KThru12':
            cannabisRetailLayerMapToNumber.schoolBufferLayerNum = currLayerId;
            break;
          case 'Supervisors_2012_Project':
            cannabisRetailLayerMapToNumber.supervisorDistLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC - On Hold':
            cannabisRetailLayerMapToNumber.onHoldLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC - Processing':
            cannabisRetailLayerMapToNumber.processLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC - Submitted':
            cannabisRetailLayerMapToNumber.submittedLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC - Under Construction':
            cannabisRetailLayerMapToNumber.underConstructionLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC - Approved':
            cannabisRetailLayerMapToNumber.approvedLayerNum = currLayerId;
            break;
          case 'CannabisLocations_OOC':
            cannabisRetailLayerMapToNumber.cannabisLocationsLayerNum = currLayerId;
            break;
          case 'Parcel Labels':
            cannabisRetailLayerMapToNumber.parcelLabelLayerNum = currLayerId;
            break;
          case 'Neighborhoods_Project':
            cannabisRetailLayerMapToNumber.neighborhoodLayerNum = currLayerId;
            break;
          default:
            break;
        }
      });
    }

    /*
      Add a feature layer to the map based on search results
    */
    function addPolygonToMap(geometry, polygonColor, centerOfPolygonColor, addPoint) {
      var centerOfPolygon = {
        type: 'point',
        longitude: geometry.extent.center.longitude,
        latitude: geometry.extent.center.latitude
      }
      var polygonGraphic = new Graphic({
        geometry: geometry,
        symbol: polygonColor
      });
      var pointGraphic = new Graphic({
        geometry: centerOfPolygon,
        symbol: centerOfPolygonColor
      });
  
      view.graphics.add(polygonGraphic);
      if (addPoint) view.graphics.add(pointGraphic);
    }

    function isLayerTurnedOn(layerName) {
      var layerToCheck = mapImageLayer.allSublayers.items.filter(function (layer) {
        return layer.title === layerName
      });
      return layerToCheck[0].visible;
    }

    /*
      This function returns a buffer promise
    */
    function getBufferGeometry(geometryToBuffer) {
      var geometryService = new GeometryService({
        url: protocol + "://sfplanninggis.org/arcgiswa/rest/services/Utilities/Geometry/GeometryServer"
      });
      var tmp = new Polygon(geometryToBuffer)

      var bufferParams = new BufferParameters({
        distances: [761.4],
        unit: 'feet',
        geodesic: false,
        bufferSpatialReference: new SpatialReference({ wkid: 3857 }),
        outSpatialReference: view.spatialReference,
        geometries: [tmp]
      });
      return geometryService.buffer(bufferParams);
    }

    /*
      Synchronously way to get buffer geometry
    */
    function getBufferGeometryAroundPolygon(geometry) {
      var bufferDistance = 600;
      var tempPolygon = new Polygon(geometry)
      var bufferGeometry = geometryEngine.geodesicBuffer(tempPolygon, bufferDistance, "feet");
      return bufferGeometry;
    }

    function addBufferAroundSearchPolygonHelper(geometry, bufferColor, zoomIntoBuffer) {
      var geometryService = new GeometryService({
        url: protocol + "://sfplanninggis.org/arcgiswa/rest/services/Utilities/Geometry/GeometryServer"
      });

      var tmp = new Polygon(geometry)
      var bufferParams = new BufferParameters({
        distances: [761.4],
        unit: 'feet',
        geodesic: false,
        bufferSpatialReference: new SpatialReference({ wkid: 3857 }),
        outSpatialReference: view.spatialReference,
        geometries: [tmp]
      });
      geometryService.buffer(bufferParams)
        .then(function (results) {
          // var centerOfPolygon = results[0].extent.center;
          var bufferGeometry = results[0];
          if (zoomIntoBuffer) zoomInToSearchPolygon(bufferGeometry)
          var centerOfPolygon = {
            type: 'point',
            longitude: results[0].extent.center.longitude,
            latitude: results[0].extent.center.latitude
          }
          var bufferGraphic = new Graphic({
            geometry: bufferGeometry,
            symbol: bufferColor
          });
          // return bufferGraphic;
          view.graphics.add(bufferGraphic)

          view.graphics.add(new Graphic({
            geometry: bufferGeometry,
            symbol: bufferColor
          }));

          view.graphics.add(new Graphic({
            geometry: centerOfPolygon,
            symbol: {
              type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
              color: [79, 102, 238, 1],
              outline: {
                color: [79, 102, 238, 1],
                width: 2
              }
            }
          }))
        })
        .catch(function (err) {
          console.log(err)
        })
    }

    function grayOutOthersOnMap(url, attributeToCheck, attributeVal) {
      graphicLayerForNHoodAndDistrct.removeAll();
      var url = url;
      var returnGeometry = true;
      var outFields = ["*"];
      var queryString = "(1=1)";
      var index;
      var geometry = null;
      var identifyResponse;

      getQueryTaskPromiseHelper(url, queryString, returnGeometry, outFields, geometry)
        .then(function (response) {
          var allFeatures = response.features;
          for (var i = 0; i < allFeatures.length; i++) {
            var currAttributeVal = allFeatures[i].attributes[attributeToCheck];
            if (currAttributeVal === attributeVal) {
              index = i;
            }
          }

          var itemOfInterest = allFeatures.splice(index, 1);
          var otherFeaturesColor = {
            type: 'simple-fill',
            color: [33, 33, 35, 0.5],
            style: 'solid',
            outline: {
              color: [33, 33, 35, 0.1],
              width: 0
            }
          };

          allFeatures.forEach(function (feature) {
            var currGeometry = feature.geometry;
            var currGraphic = new Graphic({
              geometry: currGeometry,
              symbol: otherFeaturesColor
            });
            graphicLayerForNHoodAndDistrct.add(currGraphic);
          })
        })
    }

    function turnOffLayerHelper(layerTitleArr) {
      mapImageLayer.sublayers.items.forEach(function(layer) {
        if (layerTitleArr.indexOf(layer.title) !== -1) {
          layer.visible = false;
        }
      })
    }

    /*
      Runs identify task to see if clicked parcel is a cannabis retail. 
      Also runs a check to see if it is inside a permitted layer
    */
    function executeIdentifyTask(event) {
      var identifyTask = new IdentifyTask(CANNABIS_RETAIL_SERVICE_URL);
      var identifyParams = new IdentifyParameters();
      // listOfItemsInsideSearchBuffer = [];
      // $('.esri-popup__header-title').css('display', 'none');
      var parcelNum;
      var insideZoning = 'none';
      var bufferGeometry;
      var parcelGeometry;
      var drawParcel = true;
      identifyParams.tolerance = 0;
      identifyParams.returnGeometry = true;
      identifyParams.layerIds = [
        cannabisRetailLayerMapToNumber.parcelLabelLayerNum,
        cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_LAYER_NUM,
        cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_WITHCU_LAYER_NUM,
        cannabisRetailLayerMapToNumber.CANNABIS_PERMITTED_WITH_MICROBUSINESS_LAYER_NUM,
        cannabisRetailLayerMapToNumber.mcdLayerNum,
        cannabisRetailLayerMapToNumber.cannabisLocationsLayerNum,
      ];

      // Handle with identify on map on mobile
      if (App.isOnMobile()) {
        // Reorder identify layer ids if on mobile to put supervisor district first
        if (map.findLayerById('supervisor-layer')) {
          var tempArr = [cannabisRetailLayerMapToNumber.supervisorDistLayerNum];
          identifyParams.layerIds = tempArr.concat(identifyParams.layerIds);
        } else if (map.findLayerById('neighborhood-layer')) {
          var tempArr = [cannabisRetailLayerMapToNumber.neighborhoodLayerNum];
          identifyParams.layerIds = tempArr.concat(identifyParams.layerIds);
        }
      }

      identifyParams.layerOption = 'all';
      identifyParams.width = view.width;
      identifyParams.height = view.height;
      identifyParams.geometry = event.mapPoint;
      identifyParams.mapExtent = view.extent;

      if (allowIdentifyOnPermits === false && supervisorLayerOn) {
        identifyParams.layerIds = [
          cannabisRetailLayerMapToNumber.supervisorDistLayerNum,
        ];
      } else if (allowIdentifyOnPermits === false && neighborhoodLayerOn) {
        identifyParams.layerIds = [
          cannabisRetailLayerMapToNumber.neighborhoodLayerNum,
        ];
      }
      PopupCtrl.setIsOnMultipleView(false);

      
      // logic = check first item layer name. then use name to see if layer is turned on, if turned on then display mcd popup. else if layer not turned on then use next item in array and then identify 
      var callSpinner = true;
      var cannabisPermitCount = 0;
      var mcdCount = 0;
      identifyTask
        .execute(identifyParams)
        .then(function (response) {
          // Do not call spinner if clicked on nothing or just zoning
          if (response.results.length === 1) {
            if (response.results[0].layerName === "PermittedWithCU" || 
                response.results[0].layerName === "Permitted" || 
                response.results[0].layerName === "PermittedWithMicrobusiness" ) {
                  callSpinner = false;
            }
          } else if (response.results.length === 0) {
            callSpinner = false;
          }

          if (callSpinner) {
            callLoadSpinner();
          } else {
            if (App.isOnMobile()) UICtrl.changeMapHeightAndHandleTabDisplay();
          }

          identifyResponse = response;
          var results = response.results;
          for (var i = 0; i < results.length; i++) {
            if (results[i].layerName === 'Parcel Labels') {
              parcelGeometry = results[i].feature.geometry;
            } 
            if (results[i].layerName === 'CannabisLocations_OOC') {
              cannabisPermitCount++;
            }
            if (results[i].layerName === 'MCDs') {
              mcdCount++
            }
          }

          bufferGeometry = getBufferGeometryAroundPolygon(parcelGeometry);
          return getItemsInsideParcelBufferHelper(bufferGeometry)
        })
        .then(function(itemsInsideBufferResponse) {
          // assign variable 
          listOfItemsInsideSearchBuffer = 
            itemsInsideBufferResponse.filter(function(eachResponse) {
              return eachResponse.features.length !== 0;
            });
        })
        .then(function() {
          map.remove(polygonLayerAddedToMap)

          // remove all graphics other than supervisor districts
          view.graphics.items = [];
          
          var results = identifyResponse.results
          return results.map(function (result) {
            var feature = result.feature;
            var layerName = result.layerName;
            var featureAttributes = feature.attributes;
            // var geometry = feature.geometry;
            if (layerName === 'Permitted') {
              insideZoning = 'Allowed';
              feature.isZoning = true;
            } else if (layerName === 'PermittedWithCU') {
              insideZoning = 'Allowed with Conditional Use Authorization from SF Planning';
              feature.isZoning = true;
            } else if (layerName === 'PermittedWithMicrobusiness') {
              insideZoning = 'Microbusiness permit allowed';
              feature.isZoning = true;
            } else if (layerName === 'Supervisors_2012_Project') {
              cancelSpinner();
              // graphicLayerForNHoodAndDistrct.removeAll();
              var pointColor = {
                type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
                color: [0, 0, 0, 1],
                outline: {
                  color: [0, 0, 0, 1],
                  width: 2
                }
              }
              view.graphics.items= [];
              var addPoint = false;
              var supDist = feature.attributes.supdist;
              var supervisor = feature.attributes.supervisor;

              if (App.isOnMobile()) {
                // handle mobile
                if (Number(initialDistrictSelection) === Number(supervisor)) {
                } else {
                  drawParcel = false;
                  UICtrl.changeMapHeightAndHandleTabDisplay();
                }
                initialDistrictSelection = supervisor;
              } else {
                // handle desktop view
                initialDistrictSelection = supervisor;
              }
              
              var geometry = feature.geometry;
              var attributeToCheck = "supdist";
              var supervisorLayerUrl = CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.supervisorDistLayerNum;


              turnOffLayerHelper([
                'SchoolsPublicPrivateDec2015_600ftBuffer_KThru12', 'SchoolsPublicPrivateDec2015_KThru12'
              ]);

              turnOnCheckboxesBesidesHelper(['neighborhood', 'schools']);
              turnOnOtherLayersBesidesHelper('Supervisors_2012_Project', 'Neighborhoods_Project');
              addPolygonToMap(geometry, polygonColoringForInputSearch, pointColor, addPoint);
              zoomInToSearchPolygon(geometry);
              grayOutOthersOnMap(supervisorLayerUrl, attributeToCheck, supDist);
              UICtrl.hideMobileMenu();
              UICtrl.changeMobileTabsToNonActiveColors();
            } else if (layerName === 'Neighborhoods_Project') {
              cancelSpinner();
              graphicLayerForNHoodAndDistrct.removeAll();
              var pointColor = {
                type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
                color: [0, 0, 0, 1],
                outline: {
                  color: [0, 0, 0, 1],
                  width: 2
                }
              }
              var addPoint = false;
              var nHood = feature.attributes.NEIGHBORHOOD;
              var attributeToCheck = "NEIGHBORHOOD";
              var supervisorLayerUrl = CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.neighborhoodLayerNum;
              var geometry = feature.geometry;
              var nHood = feature.attributes.NEIGHBORHOOD;
              if (App.isOnMobile()) {
                // handle mobile
                if (initialNHoodSelection === nHood) {
                } else {
                  drawParcel = false;
                  UICtrl.changeMapHeightAndHandleTabDisplay();
                }
                initialNHoodSelection = nHood;
              } else {
                initialNHoodSelection = nHood;
              }
              turnOffLayerHelper([
                'SchoolsPublicPrivateDec2015_600ftBuffer_KThru12', 'SchoolsPublicPrivateDec2015_KThru12'
              ]);
              turnOnCheckboxesBesidesHelper(['supervisor', 'schools']);
              turnOnOtherLayersBesidesHelper('Supervisors_2012_Project', 'Neighborhoods_Project');
              addPolygonToMap(geometry, polygonColoringForInputSearch, pointColor, addPoint);
              zoomInToSearchPolygon(feature.geometry);
              grayOutOthersOnMap(supervisorLayerUrl, attributeToCheck, nHood);
              UICtrl.hideMobileMenu();
              UICtrl.changeMobileTabsToNonActiveColors();
            }
            else if (layerName === 'MCDs') {
              var mcdTradeName = result.feature.attributes.DBA;
              var isMcd = true;
              var isCannabisPermit = false;
              var popupHtml = getPopupForSearch(isMcd, isCannabisPermit, featureAttributes, insideZoning);
              feature.popupTemplate = {
                title: mcdTradeName,
                content: popupHtml
              }
              feature.isMCD = true;
            } else if (layerName === 'CannabisLocations_OOC') {
              var cannabisTradeName = result.feature.attributes.dba_name;
              var isMcd = false;
              var isCannabisPermit = true;
              var runFilter = true;
              if (cannabisPermitCount === 1 && (mcdCount >= 1)) {
                runFilter = false;
              } else if (cannabisPermitCount > 1) {
                runFilter = false;
              }
              var popupHtml = getPopupForSearch(isMcd, isCannabisPermit, featureAttributes, insideZoning, runFilter);
              feature.popupTemplate = {
                title: cannabisTradeName,
                content: popupHtml
              }
              feature.isCannabisPermit = true;
            } else if (layerName === 'Parcel Labels') {
              parcelGeometry = feature.geometry;
              if (drawParcel) {
                var isMcd = false;
                var isCannabisPermit = false;
                parcelNum = featureAttributes.mapblklot;
                parcelAttributes = featureAttributes;
                var layerToAddToMap = new FeatureLayer({
                  objectIdField: "OBJECTID",
                  source: [feature],
                  fields: [],
                  renderer: polygonRenderer
                });
  
                polygonLayerAddedToMap = layerToAddToMap;
                map.add(polygonLayerAddedToMap);
                feature.checkForSchoolBuffer = true;
                feature.zoning = insideZoning;
                bufferGeometry = getBufferGeometryAroundPolygon(parcelGeometry);
              }
            }
            return feature;
          })
        })
        .then(showPopup);

      function showPopup(arrayOfPopupTemplates) {
        var parcelIsMcdOrCannabisPermit = false;
        var popupLocation = event.mapPoint;
        MapCtrl.setCurrPopupLocation(popupLocation);
        arrayOfPopupTemplates.forEach(function (popupItem) {
          if (popupItem.isCannabisPermit === true || popupItem.isMCD === true) {
            parcelIsMcdOrCannabisPermit = true;
          }
        });

        var itemToCheckIfInsideBuffer = arrayOfPopupTemplates.filter(function (popup) {
          return popup.checkForSchoolBuffer === true;
        })[0];
        var tempGeom = itemToCheckIfInsideBuffer.geometry;
        zoomInToSearchPolygon(bufferGeometry);
        // var centerOfPolygon = {
        //   type: 'point',
        //   longitude: parcelGeometry.extent.longitude,
        //   latitude: parcelGeometry.extent.latitude
        // }
        // var centerOfPolygon = {
        //   type: 'point',
        //   longitude: parcelGeometry.centroid.longitude,
        //   latitude: parcelGeometry.centroid.latitude
        // }
        centerOfPolygon = parcelGeometry.extent.center;
        view.graphics.add(new Graphic({
          geometry: bufferGeometry,
          symbol: {
            type: 'simple-fill',
            color: [146, 148, 150, 0.25],
            style: 'solid',
            outline: {
              color: [79, 102, 238, 1],
              width: 2
            }
          }
        }));
        var pointColor = {
          type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
          color: [79, 102, 238, 1],
          outline: {
            color: [79, 102, 238, 1],
            width: 2
          }
        }
        var pointCentroidGraphic = getPolygonCentroidGraphic(centerOfPolygon, pointColor);
        view.graphics.add(pointCentroidGraphic);
        if (parcelIsMcdOrCannabisPermit) {
          showPopupsForMcdOrCannabisPermits(arrayOfPopupTemplates, popupLocation);
        } else {
          checkIfParcelInsideApprovedBuffer(parcelGeometry)
          .then(function(approvedResponse) {
            var isInsideApprovedBuffer = approvedResponse.features.length > 0;
            if (isInsideApprovedBuffer) insideZoning = 'nearByApproved';
            showPopupsForRegularParcels(tempGeom, parcelNum, popupLocation, insideZoning);
          });
        }
        if (App.isOnMobile()) {
          UICtrl.changeToNewMapHeight();
        }
        cancelSpinner();
      }
    }

    function getItemsInsideParcelBufferHelper(bufferGeom) {
      var cannabisMapServiceUrl = protocol + '://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer';
      var layersToCheckAgainstBuffer = [
        new FeatureLayer({
          url: cannabisMapServiceUrl + '/' + cannabisRetailLayerMapToNumber.schoolLayerNum,
        }),
        new FeatureLayer({
          url: cannabisMapServiceUrl + '/' + cannabisRetailLayerMapToNumber.onHoldLayerNum,
        }),
        new FeatureLayer({
          url: cannabisMapServiceUrl + '/' + cannabisRetailLayerMapToNumber.processLayerNum,
        }),
        new FeatureLayer({
          url: cannabisMapServiceUrl + '/' + cannabisRetailLayerMapToNumber.submittedLayerNum,
        }),
        new FeatureLayer({
          url: cannabisMapServiceUrl + '/' + cannabisRetailLayerMapToNumber.underConstructionLayerNum,
        }),
        new FeatureLayer({
          url: cannabisMapServiceUrl + '/' + cannabisRetailLayerMapToNumber.approvedLayerNum,
        }),
        new FeatureLayer({
          url: cannabisMapServiceUrl + '/' + cannabisRetailLayerMapToNumber.mcdLayerNum,
        }),
      ];
      var spatialRelationship = 'intersects';
      var promiseArr = layersToCheckAgainstBuffer.map(function (featureLayer) {
        return runSpatialOnGeometryAndLayer(bufferGeom, featureLayer, spatialRelationship)
      });
      return Promise.all(promiseArr);
    }

    /*
      This function first checks to see if the parcel is insidse a school buffer.
      Then it gets the appropriate popup html to display from getPopupForSearch
    */
    function showPopupsForRegularParcels(geom, searchString, popupLocation, insideZoning) {
      var isMcd = false;
      var isCannabisPermit = false;
      var schoolBufferMapServiceUrl = CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.schoolBufferLayerNum;
      var schoolBufferFeatureLayer = new FeatureLayer({
        url: schoolBufferMapServiceUrl
      });
      var spatialRel = 'intersects';
      var attributesFromGeocoder;
      currPopupLocation = popupLocation;
      SearchCtrl.getGeocoderResponse(searchString)
      .then(function (response) {
        var jsonResponse = JSON.parse(response);
        attributesFromGeocoder = jsonResponse.features[0].attributes;
        var addressString = attributesFromGeocoder.ADDRESS || attributesFromGeocoder.ADDRESSSIMPLE;
        if (!addressString) {
          addressString = attributesFromGeocoder.mapblklot;
        }   
        SearchCtrl.setAddressString(addressString);
        return;
      })
      .then(function () {
        return runSpatialOnGeometryAndLayer(geom, schoolBufferFeatureLayer, spatialRel)
      })
      .then(function (geomInsideSchoolBuffResponse) {
        var isInsideSchoolBuffer = geomInsideSchoolBuffResponse.features.length > 0;
        if (insideZoning !== 'none') {
          if (isInsideSchoolBuffer) {
            insideZoning = 'insideSchoolBuffer';
          }
        }
        var popupHtml = getPopupForSearch(isMcd, isCannabisPermit, attributesFromGeocoder, insideZoning);
        var popupArr = [];
        popupArr.push({
          popupTemplate: {
            title: '',
            content: popupHtml
          }
        });
        return popupArr
      })
      .then(function (popupArr) {
        var updatedPopups = addFillerSpaceToPopIfOnlyOne(popupArr);
        PopupCtrl.setPopupForSearch(updatedPopups);
        view.popup.open({
          features: updatedPopups,
          location: popupLocation
        });
      })
      cancelSpinner();
    }

    /*
      This function show popups for mcd or cannabis permits
    */
    function showPopupsForMcdOrCannabisPermits(arrayOfPopupTemplates, popupLocation) {
      var filteredPopup = arrayOfPopupTemplates.filter(function (result) {
        return result.popupTemplate !== null && result !== undefined;
      });
      // make copy of filteredpopup
      popupItemsArr = filteredPopup.slice(0, filteredPopup.length);
      if (filteredPopup.length > 0) {
        var updatedPopups = addFillerSpaceToPopIfOnlyOne(filteredPopup);
        
        if (updatedPopups.length > 1) {
          UICtrl.changePopupFooterColor();
        }
        PopupCtrl.setPopupForSearch(updatedPopups);
        view.popup.open({
          features: updatedPopups,
          location: popupLocation
        });
      }
      cancelSpinner();
    }

    /* 
      zoom in to the geometry passed in to parameter
    */
    function zoomInToSearchPolygon(geometryToZoomIn) {
      view.goTo(
        {
          target: geometryToZoomIn,
        },
        {
          duration: 700
        }
      )
    }

    /* 
      return promise that runs a query to check if the polygon is inside the feature layer
    */
    function runSpatialOnGeometryAndLayer(polygonToCheck, featureLayer, spatialRelationship) {
      var promise;
      var query = featureLayer.createQuery();
      query.geometry = polygonToCheck;
      query.spatialRelationship = spatialRelationship;
      promise = featureLayer.queryFeatures(query)
      return promise;
    }

    /*
      Get layers that are turned on and run query to see if intersect added search polygon
    */
    function turnOffSearchLabel(feature) {

      var searchPolygon = feature[0].geometry;
      var cannabisPermitCheckboxes = [];
      var cannabisRetailIds = ['submitted', 'onHold', 'processing', 'underConstruction', 'approved'];
      cannabisRetailIds.forEach(function (id) {
        cannabisPermitCheckboxes.push(document.getElementById(id));
      });
      var turnedOnLayers = cannabisPermitCheckboxes.filter(function (input) {
        return input.checked === true;
      });

      var turnedOnLayersId = turnedOnLayers.map(function (eachLayer) {
        return (Number(eachLayer.value))
      })

      for (var i = 0; i < turnedOnLayersId.length; i++) {
        var currLayerUrl = protocol + '://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer/' + turnedOnLayersId[i];
        var layerToCheck = new FeatureLayer({
          url: currLayerUrl
        });
        var spatialRelToCheck = 'intersects'

        runSpatialOnGeometryAndLayer(searchPolygon, layerToCheck, spatialRelToCheck)
          .then(function (response) {
            if (response.features.length !== 0) {
              polygonLayerAddedToMap.labelsVisible = false;
            }
          })
      }
    }

    /*
      Uses OBJECTID for cannabis permits to remove duplicates
      Uses mapblklot for mcds to remove duplicates for now
    */
    function filterItemsInsideBufferHelper(id, typeOfData) {
      for (var i = 0; i < listOfItemsInsideSearchBuffer.length; i++) {
        var currFeatures = listOfItemsInsideSearchBuffer[i].features;
        for (var j = 0; j < currFeatures.length; j++) {

          var currAttribute = currFeatures[j].attributes; 
          // dba_name for cannabis permits and dba for mcds
          var objectId;
          if (typeOfData === 'cannabis-permit') {
            id = Number(id);
            objectId = currAttribute.OBJECTID;
          } else if (typeOfData === 'mcds') {
            objectId = currAttribute.mapblklot;
          }
        
          if(id === objectId ) {
            listOfItemsInsideSearchBuffer[i].features.splice(j, 1);
          }
          // remove item if it has 0 features
          if (listOfItemsInsideSearchBuffer[i].features.length === 0) {
            listOfItemsInsideSearchBuffer.splice(i, 1);
          }
        }
      }
    }

    function getPopupForSearch(isMcd, isCannabisPermit, attributes, zoningOrStatus, runFilter) {
      var dbaName;
      var address;
      var type;
      var popupHtml = '';
      var title;
      var id;
      if (attributes.dba_name) {
        title = 'cannabis-permit';
        id = attributes.OBJECTID
      } else if (attributes.dba || attributes.DBA) {
        title = 'mcds';
        id = attributes.mapblklot;
      } else {
        title = 'regular-parcel';
      }

      // For zoning will have to run query to see which zoning it is in
      var permitTypeMapping = {
        "Submitted": {
          divId: "submitted",
          zoning: ""
        },
        "Processing": {
          divId: "processing"
        },
        "Under Construction": {
          divId: "underConstruction"
        },
        "On Hold": {
          divId: "onHold"
        },
        "Approved": {
          divId: "approved"
        }
      }
      popupHtml += '<div class="popup-parcel-information-container"' + 'title='+ title + ' id=' + id +'>'
      popupHtml += '<table class="status-section">'
      if (isCannabisPermit) {
        var permitType = attributes.PermitStatus;
        var divId = permitTypeMapping[permitType].divId;
        var id = attributes.OBJECTID
        dbaName = attributes.dba_name;
        address = attributes.address;
        type = attributes.activities;
        if (runFilter) filterItemsInsideBufferHelper(id, 'cannabis-permit');

        var typeArr = type.split(' ')
        capitalizeTypeArr = typeArr.map(function(item) {
          if (item[0] !== '(') {
            return item[0].toUpperCase() + item.slice(1,)
          } else {
            return '(' + item[1].toUpperCase() + item.slice(2,)
          }
        });
        var captalizedType = capitalizeTypeArr.join(' ');

        popupHtml +=
          '<div class="cannabis-permit-container">' +
          '<div class="cannabis-permit" id="' + divId + '">' + permitType + '</div>' +
          '</div>' +
          '<div class="align-left retail-name">' + dbaName + '</div>' +
          '<div class="align-left retail-address">' + address + '</div>' +
          '<table class="status-section" >' +
          // '<tr>' +
          // '<td class="attribute">Status</td>' +
          // '<td class="attribute-detail" style="padding-right: 15px">Referred to Planning Department' +
          // '</tr>' +
          '<tr>' +
          '<td class="attribute">Type</td>' +
          '<td class="attribute-detail">' + captalizedType + '</td>' +
          '</tr>' 
      } else if (isMcd) {
        dbaName = attributes.DBA || attributes.dba;
        address = attributes.Address || attributes.address;
        popupHtml +=
          '<div class="cannabis-permit-container">' +
          '<div class="cannabis-permit" id="mcd">Existing medical cannabis dispensaries</div>' +
          '</div>' +
          '<div class="align-left retail-name">' + dbaName + '</div>' +
          '<div class="align-left retail-address">' + address + '</div>' +
          '<table class="status-section" >' +
          '<tr>' +
          '<td class="attribute">Type</td>' +
          '<td class="attribute-detail">Existing medical cannabis dispensaries</td>' +
          '</tr>'
      } else if (!isMcd && !isCannabisPermit) {
        if (attributes !== undefined) {
          var address = attributes.ADDRESS || attributes.ADDRESSSIMPLE;
          if (!address) {
            address = attributes.mapblklot;
          }
          popupHtml += '<div class="align-left retail-name">' + address + '</div>';
          if (zoningOrStatus !== 'insideSchoolBuffer' || zoningOrStatus === 'none') {
            popupHtml +=
              '<tr>' +
              '<td class="attribute">Status</td>' +
              '<td class="attribute-detail">No permits associated with this location</td>' +
              '</tr>'
          }
        }
      }
      if (listOfItemsInsideSearchBuffer.length !== 0) {
        popupHtml += '<tr><td class="attribute nearby">Nearby</td>' +
          '<td class="attribute-detail"><a href="javascript:void(0)" class="show-nearby-locations">See the list of locations within 600 ft</a></td></tr>'
      }
      SearchCtrl.setAddressString(address);

      popupHtml += '</table>'
      popupHtml += getDisplayBasedOnZoningAndStatus(zoningOrStatus, isMcd)
      popupHtml += '</div>'
      return popupHtml;
    }

    function getDisplayBasedOnZoningAndStatus(zoningName, isMcd) {
      var copyOfZoningName = zoningName;
      var zoningImage;
      var planningContactUrl = 'https://sfplanning.org/location-and-hours';
      var discrentionaryMessage = 'Retail Cannabis: Principally permitted'
      if (isMcd) {
        discrentionaryMessage = 'Medical Cannabis: Permitted subject to mandatory Discretionary Review';
      }
      if (copyOfZoningName === 'insideSchoolBuffer') {
        copyOfZoningName = 'This location might be within the buffer distance of a school';
        discrentionaryMessage = '<a target="_blank" href="' + planningContactUrl + '">Check with SF Planning</a> if you can have a cannabis storefront here.'
      } else if (copyOfZoningName === 'nearByApproved') {
        copyOfZoningName = 'This location appears to be within the buffer distance of an approved application';
        discrentionaryMessage = '<a target="_blank" href="' + planningContactUrl + '">Check with SF Planning</a> if you can have a cannabis storefront here.'
      } else if (copyOfZoningName === 'none') {
        copyOfZoningName = 'Not Allowed';
        discrentionaryMessage = 'No cannabis activities are allowed in this location';
      }
      switch (zoningName) {
        case 'Allowed with Conditional Use Authorization from SF Planning':
          zoningImage = 'images/legend-conditional-use.svg';
          break;
        case 'Allowed':
          zoningImage = 'images/legend-allow.png';
          break;
        case 'Microbusiness permit allowed':
          zoningImage = 'images/legend-microbusiness.png';
          break;
        case 'insideSchoolBuffer':
          zoningImage = 'images/school.svg';
          break;
        case 'nearByApproved':
          zoningImage = 'images/Approved-pin.svg';
          break;
        case 'none':
          zoningImage = 'images/legend-not-allowed.svg';
          break;
        default:
          break
      }
      var zoningMessage =
        '<div class="zoning-information" style="margin-top:5px">' +
        '<div class="cannabis-zoning">' +
        '<div class="cannabis-zoning-image-container" ><img  class="cannabis-zoning__image" src="' + zoningImage + '"></div>' +
        '<div class="cannabis-zoning__text">' + copyOfZoningName + '</div>' +
        '</div>' +
        '<div class="disretionary-message">' + discrentionaryMessage + '</div> </div>'

      return zoningMessage;
    }

    /*
      This function takes in a negative buffered geometry and checks to see what cannabis zoning it is in. The return type is a string
    */
    function getInsideWhatZoning(negativeBufferedGeometry) {
      var spatialRelToCheck = 'intersects'

      return runSpatialOnGeometryAndLayer(negativeBufferedGeometry, cannabisPermittedWithMicrobusinessLayer, spatialRelToCheck)
      .then(function (response) {
        if (response.features.length !== 0) {
          return 'Microbusiness permit allowed';
        } else {
          return runSpatialOnGeometryAndLayer(negativeBufferedGeometry, cannabisPermittedWithCuLayer, spatialRelToCheck)
        }
      })
      .then(function (response) {
        if (!response.features) {
          return response
        } else {
          if (response.features.length !== 0) {
            return 'Allowed with Conditional Use Authorization from SF Planning';
          } else {
            return runSpatialOnGeometryAndLayer(negativeBufferedGeometry, cannabisPermitedLayer, spatialRelToCheck)
          }
        }
      })
      .then(function (response) {
        if (!response.features) {
          return response;
        } else {
          if (response.features.length !== 0) {
            return 'Allowed';
          } else {
            return 'none';
          }
        }
      })
    }

    /*
      returns a new feature layer instance
    */
    function createNewFeatureLayer(objectIdField, fields, source, renderer, outFields, geometryType) {
      var newFeatureLayer = new FeatureLayer({
        objectIdField: objectIdField,
        fields: fields,
        source: source,
        renderer: renderer,
        outFields: outFields,
        geometryType: geometryType
      });
      return newFeatureLayer;
    }

    /*
      return number of cannabis zoning geometry is in
    */
    function getNumberOfZoningGeometryIsin(geometryToCheck) {
      var numOfZoningsGeometryIn = 0;
      var spatialRelToCheck = 'intersects';
      return runSpatialOnGeometryAndLayer(geometryToCheck, cannabisPermittedWithMicrobusinessLayer, spatialRelToCheck).then(function (response) {
        if (response && response.features.length !== 0) {
          numOfZoningsGeometryIn += 1;
        }
        return runSpatialOnGeometryAndLayer(geometryToCheck, cannabisPermittedWithCuLayer, spatialRelToCheck)
      })
      .then(function (response) {
        if (response && response.features.length !== 0) {
          numOfZoningsGeometryIn += 1;
        }
        return runSpatialOnGeometryAndLayer(geometryToCheck, cannabisPermitedLayer, spatialRelToCheck)
      })
      .then(function (response) {
        if (response && response.features.length !== 0) {
          numOfZoningsGeometryIn += 1;
        }
        return numOfZoningsGeometryIn;
      });

    }

    /*
      this function adds some filler white space to the popup at the bottom if it is just one
    */
    function addFillerSpaceToPopIfOnlyOne(arrayOfPopups) {
      var copyOfArr = arrayOfPopups.slice(0, arrayOfPopups.length);
      if (copyOfArr.length === 1) {
        if (!App.isOnMobile()) {
          copyOfArr[0].popupTemplate.content += '<div class="filler-space"></div>'
        }
      }
      return copyOfArr
    }

    function getPolygonCentroidGraphic(pointGeometry, color) {
      var centroidPointGraphic = new Graphic({
        geometry: pointGeometry,
        symbol: color
      });
      return centroidPointGraphic;
    }

    /*
      this function displays the search polygon, zooms in to it, and displays the popup
    */
    function addSearchPolygonToMapHelper(jsonData, searchType) {
      map.remove(polygonLayerAddedToMap);
      // view.graphics.items = [];
      var negativeBufferedGeometry;
      var NEGATIVE_BUFFER_DISTANCE_IN_FEET = -0.2;
      var firstResultFeature;
      var firstResultAttributes;

      var isOnMcd = false;
      var isOnCannabisPermit = false;

      var mapBlockLotNum;
      var tempPolygonHolder;
      var featuresFromJsonResponse;
      var geometry;
      var correctedFieldsToUse;
      var polygonCentroidPoint;

      var pointColor = {
        type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
        color: [79, 102, 238, 1],
        outline: {
          color: [79, 102, 238, 1],
          width: 2
        }
      }

      firstResultFeature = jsonData.features[0];
      firstResultAttributes = firstResultFeature.attributes;
      correctedFieldsToUse = jsonData.fields;
      if (searchType === 'searchingByGeocoder') {
        correctedFieldsToUse.forEach(function (eachField) {
          eachField.type = 'string';
        });
      }

      featuresFromJsonResponse = [jsonData.features[0]];

      featuresFromJsonResponse[0].geometry.type = 'polygon';
      var geometryFromJsonResponse = jsonData.features[0].geometry;
      var test = jsonData.features[0].geometry;
      geometry = new Polygon(geometryFromJsonResponse);
      // polygonCentroidPoint = {
      //   type: 'point',
      //   longitude: geometry.centroid.longitude,
      //   latitude: geometry.centroid.latitude
      // };

      polygonCentroidPoint = geometry.extent.center;

      tempPolygonHolder = new Polygon(geometryFromJsonResponse);
      if (searchType === 'searchingByAttributeTable') {
        mapBlockLotNum = firstResultAttributes.parcelToGeocode;
      } else {
        mapBlockLotNum = firstResultAttributes.blklot;
      }

      mcdLayerOn = isLayerTurnedOn('MCDs');

      negativeBufferedGeometry = geometryEngine.geodesicBuffer(tempPolygonHolder, NEGATIVE_BUFFER_DISTANCE_IN_FEET, "feet");

      var tempSearchLayerToAddToMap = createNewFeatureLayer('OBJECTID', correctedFieldsToUse, featuresFromJsonResponse, polygonRenderer, ["*"], 'polygon')
      polygonLayerAddedToMap = tempSearchLayerToAddToMap;
      map.add(polygonLayerAddedToMap);
      // zoomInToSearchPolygon(tempPolygonHolder);


      if (view.popup.visible) {
        var popupVisible = true;
        if (App.isOnMobile()) {
          UICtrl.changeMapHeightAndHandleTabDisplay(popupVisible);
        }
      }

      getInsideWhatZoning(negativeBufferedGeometry)
      .then(function (zoningLayer) {
        var runFilter = false;
        SearchCtrl.checkIfParcelIsMcd(mapBlockLotNum)
        .then(function (isMcdResponse) {
          isOnMcd = isMcdResponse.features.length !== 0;
          var mcdFeatures = isMcdResponse.features;
          SearchCtrl.searchParcelIsCannabisPermit(mapBlockLotNum)
          .then(function (isCannabisPermitResponse) {
            isOnCannabisPermit = isCannabisPermitResponse.features.length !== 0;
            var cannabisFeatures = isCannabisPermitResponse.features;
            if (isOnMcd && isOnCannabisPermit) {
              var popupArrItems = [];
              isOnMcd = false;

              cannabisFeatures.forEach(function (feature) {
                var currCannabisAttribute = feature.attributes;
                var currCannabisPopupHtml = getPopupForSearch(false, true, currCannabisAttribute, zoningLayer, runFilter);
                var currCannabisTradeName = feature.attributes.dba_name;
                popupArrItems.push(
                  {
                    popupTemplate: {
                      title: currCannabisTradeName,
                      content: currCannabisPopupHtml
                    }
                  }
                )
              });

              mcdFeatures.forEach(function (feature) {
                var currMcdAttribute = feature.attributes;
                var currMcdHtml = getPopupForSearch(true, false, currMcdAttribute, zoningLayer, runFilter);
                var currMcdTradeName = feature.attributes.dba;
                popupArrItems.push(
                  {
                    popupTemplate: {
                      title: currMcdTradeName,
                      content: currMcdHtml
                    }
                  }
                )
              });
              var popupLocation = geometry.extent.center;
              
              showPopupsForMcdOrCannabisPermits(popupArrItems, popupLocation)
            } else if (isOnCannabisPermit) {
              var cannabisPermitAttributes = isCannabisPermitResponse.features[0].attributes;
              isOnMcd = false;
              isOnCannabisPermit = true;
              permitStatus = cannabisPermitAttributes.PermitStatus;
              searchPopupHtml = getPopupForSearch(isOnMcd, isOnCannabisPermit, cannabisPermitAttributes, zoningLayer);
              var popupArrItems = [];
              if (cannabisFeatures.length > 1) {
                runFilter = false;
              } else {
                runFilter = true;
              }
              cannabisFeatures.forEach(function (feature) {
                var currCannabisAttribute = feature.attributes;
                var currCannabisPopupHtml = getPopupForSearch(false, true, currCannabisAttribute, zoningLayer, runFilter);
                var currCannabisTradeName = currCannabisAttribute.dba_name;
                popupArrItems.push(
                  {
                    popupTemplate: {
                      title: currCannabisTradeName,
                      content: currCannabisPopupHtml
                    }
                  }
                )
              });
              var popupLocation = geometry.extent.center;
              showPopupsForMcdOrCannabisPermits(popupArrItems, popupLocation)
            } else if (isOnMcd) {
              var popupArrItems = [];
              mcdFeatures.forEach(function (feature) {
                var currMcdAttribute = feature.attributes;
                var currMcdHtml = getPopupForSearch(true, false, currMcdAttribute, zoningLayer);
                popupArrItems.push(
                  {
                    popupTemplate: {
                      title: '',
                      content: currMcdHtml
                    }
                  }
                )
              });
              var popupLocation = geometry.extent.center;
              showPopupsForMcdOrCannabisPermits(popupArrItems, popupLocation)
            } else {
              // run check to see if parcel is inside already permitted buffer
              // checkIfParcelInsideApprovedBuffer()
              checkIfParcelInsideApprovedBuffer(geometry)
              .then(function(queryResponse) {
                var parcelInsideApprovedBuffer = queryResponse.features.length > 0;
                if (parcelInsideApprovedBuffer) zoningLayer = 'nearByApproved'
                var searchStr = firstResultFeature.attributes.mapblklot || firstResultFeature.attributes.ADDRESSSIMPLE;
                var centerOfPolygon = polygonCentroidPoint;
                currPopupLocation = centerOfPolygon;
                showPopupsForRegularParcels(geometryFromJsonResponse, searchStr, centerOfPolygon, zoningLayer);
              });
            }
            if (App.isOnMobile()) {
              view.popup.collapsed = false;
            }
          });
        });
      })
      .then(function() {
        var pointCentroidGraphic = getPolygonCentroidGraphic(polygonCentroidPoint, pointColor);
        view.graphics.add(pointCentroidGraphic);
      })
    }

    function checkIfParcelInsideApprovedBuffer(geometry) {
      var layerNumMappings = MapCtrl.getLayerNumMapping();
      var approvedBuffLayerNum = layerNumMappings.approvedBuffLayerNum;
      var approvedBuffUrl = CANNABIS_RETAIL_SERVICE_URL + '/' + approvedBuffLayerNum;
      var queryStr = '(1=1)';
      var returnGeom = true;
      var outFields = ["*"];
      return getQueryTaskPromiseHelper(approvedBuffUrl, queryStr, returnGeom, outFields, geometry)
    }

    function performSearchQuery(layerName, id) {
      var mapServiceUrl = CANNABIS_RETAIL_SERVICE_URL;
      if (layerName === 'cannabisPermitOnHold') {
        mapServiceUrl += '/' + cannabisRetailLayerMapToNumber.onHoldLayerNum;
      } else if (layerName === 'cannabisPermitProcessing') {
        mapServiceUrl += '/' + cannabisRetailLayerMapToNumber.processLayerNum;
      } else if (layerName === 'cannabisPermitSubmitted') {
        mapServiceUrl += '/' + cannabisRetailLayerMapToNumber.submittedLayerNum;
      } else if (layerName === 'cannabisPermitsApproved') {
        mapServiceUrl += '/' + cannabisRetailLayerMapToNumber.approvedLayerNum;
      } else if (layerName === 'cannabisPermitsConstruction') {
        mapServiceUrl += '/' + cannabisRetailLayerMapToNumber.underConstructionLayerNum;
      } else if (layerName === 'mcds') {
        mapServiceUrl += '/' + cannabisRetailLayerMapToNumber.mcdLayerNum;
      } else if (layerName === 'schools') {
        mapServiceUrl += '/' + cannabisRetailLayerMapToNumber.schoolLayerNum;
      }
      var query = new Query();
      var queryTask = new QueryTask(mapServiceUrl);
      query.returnGeometry = true;
      query.outFields = ["*"];
      query.where = "OBJECTID =" + id
      return queryTask.execute(query);
    }

    function getQueryTaskPromiseHelper(url, queryStr, returnGeom, outFields, geometry) {
      var query = new Query();
      var queryTask = new QueryTask(url);
      query.geometry = geometry;
      query.returnGeometry = returnGeom;
      query.outFields = outFields;
      query.where = queryStr;
      return queryTask.execute(query);
    }

    function mapLayerNameToPolygonColor(layerName) {
      var opacity = 0.5;
      var cannabisParcelSubmittedColor = [175, 235, 254, 1];
      var cannabisParcelProcessingColor = [41, 132, 214, 1];
      var cannabisParcelUnderConstr = [18, 70, 144, 1];
      var cannabisParcelOnHoldColor = [253, 240, 174, 1];
      var cannabisParcelApprovedColor = [174, 237, 80, 1];
      var mcdParelColors = [46, 82, 29, 1];
      var schoolParcelColor = [255, 255, 255, 1];

      var cannabisSubmittedBufferColor = [175, 235, 254, opacity];
      // var cannabisSubmittedBufferColor = [195, 214, 222, opacity];
      var cannabisProcessingBufferColor = [41, 132, 214, opacity];
      var cannabisUnderConstrBufferColor = [18, 70, 144, opacity];
      var cannabisOnHoldBufferColor = [253, 240, 174, opacity];
      var cannabisApprovedBufferColor = [174, 237, 80, opacity];
      var mcdBufferColor = [46, 82, 29, opacity];
      var schoolBufferColor = [191, 191, 191, opacity];

      var cannabisSubmittedDotColor = [39, 176, 255, 1];
      var cannabisProcessingDotColor = [2, 111, 211, 1];
      var cannabisUnderConstrDotColor = [15, 42, 113, 1];
      var cannabisOnHoldDotColor = [231, 178, 46, 1];
      var cannabisApprovedDotColor = [66, 134, 23, 1];
      var mcdDotColor = [46, 82, 29, 1];
      var schoolDotColor = [125, 125, 125, 1];

      var polygonColor = {
        type: 'simple-fill',
        style: 'solid',
        outline: {
          width: 2
        }
      };

      var pointColor = {
        type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
        color: [0, 0, 0, 1],
        outline: {
          color: [0, 0, 0, 1],
          width: 2
        }
      }

      var bufferColor = {
        type: 'simple-fill',
        style: 'solid',
        outline: {
          width: 0.5
        }
      }

      if (layerName === allLayerNames.cannabisSubmittedPermitName) {
        polygonColor.outline.color = cannabisParcelSubmittedColor;
        polygonColor.color = cannabisParcelSubmittedColor;
        pointColor.color = cannabisSubmittedDotColor;
        pointColor.outline.color = cannabisSubmittedDotColor;
        bufferColor.color = cannabisSubmittedBufferColor;
        bufferColor.outline.color = [39, 177, 255, 1];
      } else if (layerName === allLayerNames.cannabisProcessingPermitName) {
        polygonColor.outline.color = cannabisParcelProcessingColor;
        polygonColor.color = cannabisParcelProcessingColor;
        pointColor.color = cannabisProcessingDotColor;
        pointColor.outline.color = cannabisProcessingDotColor;
        bufferColor.color = cannabisProcessingBufferColor;
        bufferColor.outline.color = cannabisProcessingBufferColor;
      } else if (layerName === allLayerNames.cannabisUnderConstructionPermitName) {
        polygonColor.outline.color = cannabisParcelUnderConstr;
        polygonColor.color = cannabisParcelUnderConstr;
        pointColor.color = cannabisUnderConstrDotColor;
        pointColor.outline.color = cannabisUnderConstrDotColor;
        bufferColor.color = cannabisUnderConstrBufferColor;
        bufferColor.outline.color = cannabisUnderConstrBufferColor;
      } else if (layerName === allLayerNames.cannabisOnHoldPermitName) {
        polygonColor.outline.color = cannabisParcelOnHoldColor;
        polygonColor.color = cannabisParcelOnHoldColor;
        pointColor.color = cannabisOnHoldDotColor;
        pointColor.outline.color = cannabisOnHoldDotColor;
        bufferColor.color = cannabisOnHoldBufferColor;
        bufferColor.outline.color = cannabisOnHoldBufferColor;
      } else if (layerName === allLayerNames.cannabisApprovedPermitName) {
        polygonColor.outline.color = cannabisParcelApprovedColor;
        polygonColor.color = cannabisParcelApprovedColor;
        pointColor.color = cannabisApprovedDotColor;
        pointColor.outline.color = cannabisApprovedDotColor;
        bufferColor.color = cannabisApprovedBufferColor;
        bufferColor.outline.color = cannabisApprovedBufferColor;
      } else if (layerName === allLayerNames.mcdName) {
        polygonColor.outline.color = mcdParelColors;
        polygonColor.color = mcdParelColors;
        pointColor.color = mcdDotColor;
        pointColor.outline.color = mcdDotColor;
        bufferColor.color = mcdBufferColor;
        bufferColor.outline.color = mcdBufferColor;
      } else if (layerName === allLayerNames.schoolName) {
        polygonColor.outline.color = schoolParcelColor;
        polygonColor.color = schoolParcelColor;
        pointColor.color = schoolDotColor;
        pointColor.outline.color = schoolDotColor;
        bufferColor.color = schoolBufferColor;
        bufferColor.outline.color = schoolBufferColor;
      }
      return { 
        polygonColor: polygonColor, 
        pointColor: pointColor, 
        bufferColor: bufferColor 
      };
    }

    function getAllItemsInsideNeighborhood(neighborhoodFeature) {
      var testLayer = mapImageLayer.findSublayerById(4);
      var layerQuery = testLayer.createQuery();
      var neighborhoodGeometry = neighborhoodFeature[0].geometry;
      var layersToCheckAgainstNeighborhood = [
        new FeatureLayer({
          url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.schoolLayerNum,
        }),
        new FeatureLayer({
          url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.onHoldLayerNum,
        }),
        new FeatureLayer({
          url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.processLayerNum,
        }),
        new FeatureLayer({
          url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.submittedLayerNum,
        }),
        new FeatureLayer({
          url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.underConstructionLayerNum,
        }),
        new FeatureLayer({
          url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.approvedLayerNum,
        }),
        new FeatureLayer({
          url: CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.mcdLayerNum,
        }),
      ];
      var spatialRelationship = 'contains';
      var promiseArr = layersToCheckAgainstNeighborhood.map(function (featureLayer) {
        return runSpatialOnGeometryAndLayer(neighborhoodGeometry, featureLayer, spatialRelationship)
      });
      var polygonGraphicArr = [];
      var bufferGraphicArr = [];
      var pointGrahicArr = [];
      Promise.all(promiseArr)
        .then(function (response) {
          var itemsInsideNeighborhood = response.filter(function (item) {
            return item.features.length !== 0;
          });

          // getBufferGeometryAroundPolygon(itemsInsideNeighborhood)

          itemsInsideNeighborhood.forEach(function (eachLayer) {
            var eachLayerFeatures = eachLayer.features;
            var currLayerGraphicsArr = [];
            eachLayerFeatures.forEach(function (eachFeature) {
              var currGeometry = eachFeature.geometry;
              var sourceLayerTitle = eachFeature.sourceLayer.title;
              var isBuffer = false;
              var zoomIntoBuffer = false;
              var colorForPolygon = mapLayerNameToPolygonColor(sourceLayerTitle, isBuffer);
              isBuffer = true;
              var getReturnPolygon = true;

              var currBufferGraphic = getBufferGeometryAroundPolygon(currGeometry, colorForPolygon.bufferColor);
              currLayerGraphicsArr.push(currBufferGraphic);


              var polygonGrahicDisplay = addPolygonToMap(currGeometry, colorForPolygon.polygonColor, colorForPolygon.pointColor, getReturnPolygon);
              pointGrahicArr.push(polygonGrahicDisplay.pointGraphic);
              polygonGraphicArr.push(polygonGrahicDisplay.polygonGraphic);
              bufferGraphicArr.push(getBufferGeometryAroundPolygon(currGeometry, colorForPolygon.bufferColor))
              // addPolygonToMap(eachFeature, colorForPolygon.polygonColor, colorForPolygon.pointColor, getReturnPolygon);
            });
          })
          view.graphics.addMany(bufferGraphicArr)
          view.graphics.addMany(polygonGraphicArr);
          view.graphics.addMany(pointGrahicArr);
        })
    }

    function turnOnCheckboxesBesidesHelper(checkboxNameArr) {
      var checkboxes = document.querySelectorAll('input[type=checkbox]');
      for (var i = 0; i < checkboxes.length; i++) {
        var currCheckBoxName = checkboxes[i].className.split(' ')[0];
        if (checkboxNameArr.indexOf(currCheckBoxName) === -1) {
          checkboxes[i].checked =  true;
        } else {
          checkboxes[i].checked = false;
        }
      }
    }

    /*  
      This function turns on other layers besides the one added in
      as the parameter
    */
    function turnOnOtherLayersBesidesHelper(layer1, layer2) {
      var sublayers = mapImageLayer.sublayers.items;
      var oocLayerName = 'CannabisLocations_OOC';
      var schoolLayerName = 'SchoolsPublicPrivateDec2015_KThru12';
      var schoolLayerBufferName = 'SchoolsPublicPrivateDec2015_600ftBuffer_KThru12';
      var checkboxes = document.querySelectorAll('input[type=checkbox]');

      sublayers.forEach(function(eachLayer) {
        var currLayerTitle = eachLayer.title;
        if (
          currLayerTitle !== layer1 && 
          currLayerTitle !== layer2 && 
          currLayerTitle !== oocLayerName &&
          currLayerTitle !== schoolLayerBufferName &&
          currLayerTitle !== schoolLayerName
          ) {
          eachLayer.visible = true;
        }
      })
    }

    return {
      getView: function () {
        return view;
      },

      getMapServiceUrl: function() {
        return CANNABIS_RETAIL_SERVICE_URL;
      },

      getLayerNumMapping: function () {
        return cannabisRetailLayerMapToNumber;
      },

      getListOfItemsInsideParcelBuffer: function () {
        return listOfItemsInsideSearchBuffer;
      },

      setListOfItemsInsideParcelBuffer: function(itemArr) {
        listOfItemsInsideSearchBuffer = itemArr;
      },

      getCurrPopupLocation: function () {
        return currPopupLocation;
      },

      showPopup: function(popupArr) {

        view.popup.open({
          features: popupArr,
          location: this.getCurrPopupLocation()
        });

        
      },

      setCurrPopupLocation: function(location) {
        currPopupLocation = location;
      },

      getNeighborhoodLayerIsOn: function () {
        return neighborhoodLayerOn;
      },

      setNeighborhoodLayerIsOn: function (bool) {
        neighborhoodLayerOn = bool;
      },

      getSupervisorLayerOn: function () {
        return supervisorLayerOn;
      },

      getQueryTaskPromise: function(url, queryStr, returnGeom, outFields, geometry) {
        return getQueryTaskPromiseHelper(url, queryStr, returnGeom, outFields, geometry)
      },

      setSupervisorLayerOn: function (bool) {
        supervisorLayerOn = bool;
      },

      getAllLayerNames: function () {
        return allLayerNames
      },

      getItemsInsideParcelBuffer: function(bufferGeom) {
        return getItemsInsideParcelBufferHelper(bufferGeom)
      },

      zoomIntoGeometry: function(geometry) {
        zoomInToSearchPolygon(geometry);
      },

      closePopup: function() {
        view.popup.visible = false;
      },

      turnOnOtherLayersBesides: function(layer1, layer2) {
        turnOnOtherLayersBesidesHelper(layer1, layer2)
      },

      turnOffLayer: function(layerTitleArr) {
        turnOffLayerHelper(layerTitleArr);
      },

      addSupervisorLayer: function() {
        map.add(supervisorLayer);
        if (App.isOnMobile()) {
          allowIdentifyOnPermits = true;
        } else {
          allowIdentifyOnPermits = false;
        }
        // allowIdentifyOnPermits = true;
        supervisorLayer.when().then(handleHighLightingLayer)
      },

      removeNeighborHoodLayer: function() {
        map.remove(nHoodLayer);
      },

      removeSearchPolygon: function() {
        map.remove(polygonLayerAddedToMap)
      },

      removeSupervisorLayer: function() {
        map.remove(supervisorLayer);
      },

      addNHoodLayer: function() {
        map.add(nHoodLayer);

        if (App.isOnMobile()) {
          allowIdentifyOnPermits = true;
        } else {
          allowIdentifyOnPermits = false;
        }        
        nHoodLayer.when().then(handleHighLightingLayer)
      },

      /*
        This function zooms into the district of interest and grays out others
        using graphics
      */
      handleSupervisorListSelection: function(districtName) {
        graphicLayerForNHoodAndDistrct.removeAll();
        var personName = districtName.split(' - ')[1];
        // view.graphics = [];
        var supervisorLayerUrl = 
          CANNABIS_RETAIL_SERVICE_URL + 
          '/' + 
          cannabisRetailLayerMapToNumber.supervisorDistLayerNum;
        var returnGeometry = true;
        var outFields = ["*"];
        var queryString = '(1=1)';
        var geometry = null;
        return getQueryTaskPromiseHelper(supervisorLayerUrl, queryString, returnGeometry, outFields, geometry)
        .then(function(supervisorResponse) {
          var supervisorFeatures = supervisorResponse.features;
          var supervisorOfInterestIndex;
          for (var i = 0; i < supervisorFeatures.length; i++) {
            var currSupName = supervisorFeatures[i].attributes.supname;
            if (currSupName === personName) {
              supervisorOfInterestIndex = i;
              break;
            }
          }
          var supervisorOfInterestFeature = supervisorFeatures.splice(supervisorOfInterestIndex, 1);
          initialDistrictSelection = 
            supervisorOfInterestFeature[0].attributes.supervisor;
          var supervisorGeometry = supervisorOfInterestFeature[0].geometry;
          zoomInToSearchPolygon(supervisorGeometry);
          
          var otherSupervisorColor = {
            type: 'simple-fill',
            color: [33, 33, 35, 0.5],
            style: 'solid',
            outline: {
              color: [33, 33, 35, 0.1],
              width: 0
            }
          };

          var supervisorOfInterestColor = {
            type: 'simple-fill',
            color: [33, 33, 35, 0],
            style: 'solid',
            outline: {
              color: [79, 102, 238, 1],
              width: 2
            }
          };

          var supervisorGraphic = new Graphic({
            geometry: supervisorOfInterestFeature[0].geometry,
            symbol: supervisorOfInterestColor
          });

          supervisorFeatures.forEach(function (feature) {
            var currAttributes = feature.attributes;
            var currGeomtry = feature.geometry;
            var currGraphic = new Graphic({
              geometry: currGeomtry,
              symbol: otherSupervisorColor,
              attributes: currAttributes,
            });
            // view.graphics.add(currGraphic);
            graphicLayerForNHoodAndDistrct.add(currGraphic);
          });
        })
        .then(function() {
          return;
        })
      },

      handleClickingOnNhoodSelection: function (neighborhoodName) {
        view.graphics = [];
        var neighborhoodLayerUrl = CANNABIS_RETAIL_SERVICE_URL + '/' + cannabisRetailLayerMapToNumber.neighborhoodLayerNum;
        var returnGeometry = true;
        var outFields = ["*"];
        var queryString = '(1=1)';
        var geometry = null;
        getQueryTaskPromiseHelper(neighborhoodLayerUrl, queryString, returnGeometry, outFields, geometry)
        .then(function (response) {
          var allNeighborhoodFeatures = response.features;
          var neighborhoodOfInterestIndex;
          for (var i = 0; i < allNeighborhoodFeatures.length; i++) {
            var currNeighhoodName = allNeighborhoodFeatures[i].attributes.NEIGHBORHOOD;
            if (currNeighhoodName === neighborhoodName) {
              neighborhoodOfInterestIndex = i;
              break;
            }
          }
          var neighborhoodOfInterestFeature = allNeighborhoodFeatures.splice(neighborhoodOfInterestIndex, 1);

          getAllItemsInsideNeighborhood(neighborhoodOfInterestFeature);
          var nHoodGeometry = neighborhoodOfInterestFeature[0].geometry;
          zoomInToSearchPolygon(nHoodGeometry);

          var otherNeighborhoodColor = {
            type: 'simple-fill',
            color: [33, 33, 35, 0.5],
            style: 'solid',
            outline: {
              color: [33, 33, 35, 0.1],
              width: 0
            }
          };

          var neighboorOfInterestColor = {
            type: 'simple-fill',
            color: [33, 33, 35, 0],
            style: 'solid',
            outline: {
              color: [79, 102, 238, 1],
              width: 2
            }
          };

          var neighborhoodOfInterestGraphic = new Graphic({
            geometry: neighborhoodOfInterestFeature[0].geometry,
            symbol: neighboorOfInterestColor
          });

          allNeighborhoodFeatures.forEach(function (feature) {
            var currGeomtry = feature.geometry;
            var currGraphic = new Graphic({
              geometry: currGeomtry,
              symbol: otherNeighborhoodColor
            });
            view.graphics.add(currGraphic);
          });
          view.graphics.add(neighborhoodOfInterestGraphic);
        })
        .catch(function (err) {
          console.log(err)
        })
      },

      /*
        listen for supervisor or neighborhood layer turned on
      */
      listenForHoverOverLayer: function(layerName) {
        if (layerName === 'supervisor') {
          supervisorLayer.when().then(handleHighLightingLayer);
        } else if(layerName === 'neighborhood') {
          nHoodLayer.when().then(handleHighLightingLayer);
        }
      },

      removeAllGraphicsInView: function() {
        view.graphics.items = [];
      },

      removePopups: function() {
        view.popup.visible = false;
      },

      /*
        Clear graphics layer used to gray out neighborhoods / supervisor districts
      */
      clearGraphicLayers: function() {
        graphicLayerForNHoodAndDistrct.removeAll();
      },

      filterItemsInsideBuffer: function(id, filterType) {
        filterItemsInsideBufferHelper(id, filterType);
      },

      turnOnCheckboxesBesides: function(checkBoxNameArr) {
        turnOnCheckboxesBesidesHelper(checkBoxNameArr);
      },

      resetInitialNHoodOrDistrictSelections: function() {
        initialDistrictSelection = undefined;
        initialNHoodSelection = undefined;
      },

      /*
        Update visibility of layers on map using mapImageLayer if not supervisor or neighborhood
        Adds and remove feature layers if supervisor or neighborhood
      */
      updateLayerVisibility: function (event) {
        var uiSelectors = UICtrl.getUiSelectors();
        var checkboxChecked = event.target.checked;
        var superDistLayerNum = cannabisRetailLayerMapToNumber.supervisorDistLayerNum;
        var nHoodLayerNum = cannabisRetailLayerMapToNumber.neighborhoodLayerNum;
        var supervisorLayerNum = cannabisRetailLayerMapToNumber.supervisorDistLayerNum;
        var mapLayerNum = Number(event.target.value);
        var sublayer = mapImageLayer.findSublayerById(parseInt(mapLayerNum));
        var checkBoxChecked = event.target.checked;
        var bufferLayerNum;

        var currLayerUrl = CANNABIS_RETAIL_SERVICE_URL + '/' + mapLayerNum;
        
        var currLayerUrl = CANNABIS_RETAIL_SERVICE_URL + '/' + mapLayerNum;
        var clickedLayer = new FeatureLayer({
          url: currLayerUrl
        });

        if (mapLayerNum === superDistLayerNum) {
          map.remove(polygonLayerAddedToMap);
          var supervisorSubLayer = mapImageLayer.findSublayerById(parseInt(nHoodLayerNum));
          initialDistrictSelection = undefined;
          this.removeAllGraphicsInView();
          supervisorLayerOn = checkboxChecked;
          neighborhoodLayerOn = false;
          supervisorSubLayer.visible = false;
          App.toggleCheckbox(uiSelectors.neighborhoodCheckbox, false);
          App.toggleCheckbox(uiSelectors.neighborhoodCheckboxMobile, false);
          if (checkboxChecked) {
            graphicLayerForNHoodAndDistrct.removeAll();
            this.addSupervisorLayer();
            this.removeNeighborHoodLayer();
            this.setSupervisorLayerOn(true);
          } else {
            graphicLayerForNHoodAndDistrct.removeAll();
            this.removeSupervisorLayer();
            this.setSupervisorLayerOn(false);
            this.removeAllGraphicsInView();
          }
        } else if (mapLayerNum === nHoodLayerNum) {
          map.remove(polygonLayerAddedToMap);
          var nHoodSubLAyer = mapImageLayer.findSublayerById(parseInt(supervisorLayerNum));
          initialNHoodSelection = undefined;
          this.removeAllGraphicsInView();
          graphicLayerForNHoodAndDistrct.removeAll();
          supervisorLayerOn = false;
          nHoodSubLAyer.visible = false;
          neighborhoodLayerOn = checkboxChecked;
          App.toggleCheckbox(uiSelectors.supervisorCheckbox, false);
          App.toggleCheckbox(uiSelectors.supervisorCheckboxMobile, false);

          if (checkboxChecked) {
            graphicLayerForNHoodAndDistrct.removeAll();
            this.addNHoodLayer();
            this.removeSupervisorLayer();
            this.setNeighborhoodLayerIsOn(true);
          } else {
            this.removeNeighborHoodLayer();
            this.setNeighborhoodLayerIsOn(false);
            this.removeAllGraphicsInView();
          }
        } else {
          sublayer.visible = checkboxChecked;
        }


        // if (polygonLayerAddedToMap) {
        //   var geometryFromPolygonLayer = polygonLayerAddedToMap.source.items[0].geometry;
        //   var spatialRelToCheck = 'intersects'
        //   runSpatialOnGeometryAndLayer(geometryFromPolygonLayer, clickedLayer, spatialRelToCheck)
        //   .then(function (response) {
        //     if (response.features.length !== 0) {
        //       if (checkBoxChecked) {
        //         polygonLayerAddedToMap.labelsVisible = false;
        //         return polygonLayerAddedToMap.labelsVisible
        //       } else {
        //         polygonLayerAddedToMap.labelsVisible = true;
        //         return polygonLayerAddedToMap.labelsVisible
        //       }
        //     }
        //   });
        // }

        // add buffer if did not click on supervisor or neighborhood layer
        if (mapLayerNum !== superDistLayerNum && mapLayerNum !== nHoodLayerNum) {
          if (mapLayerNum === cannabisRetailLayerMapToNumber.mcdLayerNum || mapLayerNum === cannabisRetailLayerMapToNumber.schoolLayerNum) {
            bufferLayerNum = mapLayerNum + 1;
          } else {
            bufferLayerNum = mapLayerNum + 5;
          }
          if (bufferLayerNum) {
            sublayer = mapImageLayer.findSublayerById(parseInt(bufferLayerNum));
            sublayer.visible = checkboxChecked;
          }
        }
      },

      addSearchPolygonToMapAndPopup: function (jsonData, searchType, tobaccoName) {
        addSearchPolygonToMapHelper(jsonData, searchType, tobaccoName)
      },

      addBufferAroundSearchPolygon: function (geometry) {
        this.removeAllGraphicsInView();
        return getBufferGeometryAroundPolygon(geometry)
        // addBufferAroundSearchPolygonHelper(geometry, bufferColor, zoomIntoBuffer);
      },

      addGraphicToView: function(geometryToAdd, color) {
        var graphicToAdd = new Graphic({
          geometry: geometryToAdd,
          symbol: color
        })
        view.graphics.add(graphicToAdd);
      },

      handleNearbyLocationOptionClick: function(event) {
        this.removePopups();
        var targetVal = event.target;
        var className = event.target.className;
        var layerName = targetVal.title;
        var id = targetVal.firstChild.id;
        if (className.indexOf('multiple-location-td__info') !== -1) {
          var parentElement = event.target.parentElement;
          layerName = parentElement.firstChild.title;
          id = parentElement.firstChild.id;
        }
        performSearchQuery(layerName, id)
        .then(function (response) {
          var firstFeature = response.features[0];
          var geometry = firstFeature.geometry;
          var polygonColors = {
            type: 'simple-fill',
            color: [255, 255, 255, 1],
            style: 'solid',
            outline: {
              color: [0, 0, 0, 1],
              width: 2
            }
          };
          var pointColor = {
            type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
            color: [0, 0, 0, 1],
            outline: {
              color: [0, 0, 0, 1],
              width: 2
            }
          }
          var addPoint = true;
          addPolygonToMap(geometry, polygonColors, pointColor, addPoint);
        })
      },

      searchByIdInCannabisTable: function (searchStr, searchAddress, searchType, objectId) {
        var promise;
        var ALL_CANNABIS_DATA_LAYER_URL = protocol + '://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer/' + cannabisRetailLayerMapToNumber.cannabisLocationsLayerNum ;
        var capitalizeSearchString = searchStr.toUpperCase().trim();
        capitalizeSearchString = capitalizeSearchString.replace("'", "''");

        var queryTask = new QueryTask(ALL_CANNABIS_DATA_LAYER_URL);
        var query = new Query();

        if (searchType === 'findByExactMatch') {
          query.where = "OBJECTID =" + objectId

        }
        else {
          query.where = "upper(dba_name) LIKE '%" + capitalizeSearchString + "%'";
        }
        query.returnGeometry = true;
        query.outFields = ["*"];
        promise = queryTask.execute(query);
        return promise;
      },

      searchByAddressInAttributeTable: function (searchStr) {
        var promise;
        /* code goes here */
        var ALL_CANNABIS_DATA_LAYER_URL = protocol + '://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer/20';
        var capitalizeSearchString = searchStr.toUpperCase().trim();
        var itemsToRemoveFromAddress = [', SF', ', SAN FRANCISCO, CA', ', SAN FRANCISCO CA', ' SAN FRANCISCO CA', ', CALIFORNIA',
          ', CA', ',', ' SAN FRANCISCO CA', ' SAN FRANCISCO', ' STREET', ' SF'];

        itemsToRemoveFromAddress.forEach(function (item) {
          capitalizeSearchString = capitalizeSearchString.replace(item, '');
        });
        var queryTask = new QueryTask(ALL_CANNABIS_DATA_LAYER_URL);
        var query = new Query();
        query.where = "upper(address) LIKE '" + capitalizeSearchString + "%'";
        query.returnGeometry = true;
        query.outFields = ["*"];
        promise = queryTask.execute(query);
        return promise;
      }
    }
  }();

  var UICtrl = function () {
    var uiSelectors = {
      searchBox: '#searchbox',
      filterContainer: '#filter-container',
      mobileSelectedTab: '#mobile-selected-tab',
      mobileLegend: '#mobile-legend',
      filterContainer: '#filter-container',
      tabDisplayContainer: '.tab-display-container',
      modalTitle: '.modal-title',
      modalBody: '.modal-body',
      modalDisplay: '#modalDisplay',
      modalHeader: '.modal-header',
      mobileFilterContainer: '#filter-container',
      mobileFilterElements: '#filter-elements',
      mobileSelectedTab: '#mobile-selected-tab',
      legendTab: '#legend-tab',
      locationTab: '#location-tab',
      alertMobile: '#alert',
      esriBasemapToggle: '.esri-basemap-toggle',
      esriBasemapThumbnailImage: '.esri-basemap-thumbnail__image',
      tabsContainer: '.tab-container',
      mapContainer: '.map-container',
      contentContainer: '.content-container',
      esriPopupContainer: '.esri-popup__main-container',
      closeModal: '.close',
      zoningDescription: '.zoning-description',

      popupBottomPointerArrow: '.esri-popup__pointer-direction',
      neighborhoodList: '#neighborhood-list',
      supervisorList: '#supervisor-list',
      supervisorListMobile: '#supervisor-list__mobile',
      popupHeader: '.esri-popup__header',
      popupHeaderButton: '.esri-popup__header-buttons',

      neighborhoodCheckbox: '#neighborhood-checkbox',
      neighborhoodCheckboxMobile: '#neighborhood-checkbox__mobile',
      supervisorCheckbox: '#supervisor-checkbox',
      supervisorCheckboxMobile: '#supervisor-checkbox__mobile'
    }

    var allLayersNames = MapCtrl.getAllLayerNames();


    var initialLegendTabHeight = $(uiSelectors.tabDisplayContainer).height();

    function getInfoAndIcon(layerName, feature) {
      var layerInfo = {};
      layerInfo.address = feature.attributes.address;
      layerInfo.name = feature.attributes.dba || feature.attributes.dba_name;
      switch (layerName) {
        case allLayersNames.cannabisOnHoldPermitName:
          layerInfo.icon = 'images/On-Hold-pin.svg';
          layerInfo.layerName = 'cannabisPermitOnHold';
          break;
        case allLayersNames.cannabisProcessingPermitName:
          layerInfo.icon = 'images/Processing-pin.svg';
          layerInfo.layerName = 'cannabisPermitProcessing';
          break;
        case allLayersNames.cannabisSubmittedPermitName:
          layerInfo.icon = 'images/Submitted-pin.svg';
          layerInfo.layerName = 'cannabisPermitSubmitted';
          break;
        case allLayersNames.cannabisApprovedPermitName:
          layerInfo.icon = 'images/Approved-pin.svg';
          layerInfo.layerName = 'cannabisPermitsApproved';
          break;
        case allLayersNames.cannabisUnderConstructionPermitName:
          layerInfo.icon = 'images/Under-construction-pin.svg';
          layerInfo.layerName = 'cannabisPermitsConstruction';
          break;
        case allLayersNames.mcdName:
          layerInfo.icon = 'images/MCDs.svg';
          layerInfo.layerName = 'mcds';
          break;
        case allLayersNames.schoolName:
          layerInfo.icon = 'images/school.svg';
          layerInfo.address = feature.attributes.CAMPUS_ADDR,
          layerInfo.name = feature.attributes.CAMPUS_NAME,
          layerInfo.layerName = 'schools'
          break;
        default:
          break;
      }
      layerInfo.id = feature.attributes.OBJECTID;
      return layerInfo
    }

    return {
      getUiSelectors: function () {
        return uiSelectors;
      },

      /*  
        Change all mobile tabs' display to none
      */
      hideMobileMenu: function () {
        $(uiSelectors.filterContainer).css('display', 'none');
        $(uiSelectors.mobileLegend).css('display', 'none');
        $(uiSelectors.tabDisplayContainer).css('display', 'none');
      },

      /*
        Display modal with title and body content
      */
      displayModal: function (titleStr, bodyStr) {
        $(uiSelectors.modalBody).html(bodyStr);
        $(uiSelectors.modalTitle).html(titleStr);
        $(uiSelectors.modalDisplay).modal('show');
      },

      /*
        Change popup footer color
      */
      changePopupFooterColor: function () {
        var grayFooterColorHex = '#f8f8f8';
        $('.esri-popup__pointer-direction').css('background', grayFooterColorHex);
        $('.esri-popup__navigation').css('cssText', 'background: #f8f8f8');
        $('.esri-popup__footer').css('background', grayFooterColorHex);
      },

      /*
        Config popup color for showing showing near by locations
      */
      configMultipleLocationPopup: function(color) {
        $(uiSelectors.popupHeader).css('background', color);
        $(uiSelectors.popupheader).css('color', 'white');
        var popupTitle = '<span class="nearby-location-title">Nearby Locations</span>'
        $(uiSelectors.popupHeader).prepend(popupTitle);
      },


      /*
        Display list of near by locations inside popup
      */
      showNearByLocationOnPopup: function () {
        var popupInfoContainer = $('.popup-parcel-information-container')[0];
        var idForFilter = popupInfoContainer.id;
        var titleForFilter = popupInfoContainer.title;
        var listOfItemsInsideSearchBuffer = MapCtrl.getListOfItemsInsideParcelBuffer();
        
        // filter items inside buffer to exclude itself
        MapCtrl.filterItemsInsideBuffer(idForFilter, titleForFilter);

        var view = MapCtrl.getView();
        var multipleLocationPopupHtml = '';
        var isOnMultipleLocationView = PopupCtrl.getIsOnMultipleView();
        var address = SearchCtrl.getAddressFromGeocoder();
        UICtrl.configMultipleLocationPopup('#1C3E57');
        $('.esri-icon-close').css('color', 'white');

        if (isOnMultipleLocationView) {
          var popup = document.querySelector('.esri-popup__content');
          popup.classList.add('no-margin-popup')
          $('.esri-popup__content').addClass('no-margin-popup');
        }

        multipleLocationPopupHtml += '<table class="multiple-locations-inside-buffer">' +
          '<tr><td id="nearby-location-disclaimer" colspan="2">Locations within 600 feet of <span style="font-weight: 500">' + address + '</span></td></tr>';
        listOfItemsInsideSearchBuffer.forEach(function (eachItem) {
          var features = eachItem.features;
          features.forEach(function (eachFeature) {
            var centerOfGeometry = eachFeature.geometry.extent.center;
            var currFeatureLayerTitle = eachFeature.sourceLayer.title;
            var locationIconAndInfo = getInfoAndIcon(currFeatureLayerTitle, eachFeature);

            multipleLocationPopupHtml += '<tr>'
            multipleLocationPopupHtml +=
            '<td class="multiple-location-td__image"><img ';
            if (currFeatureLayerTitle === 'CannabisRetail - SchoolsPublicPrivateDec2015 KThru12') {
              multipleLocationPopupHtml += 
                'style="width: 25px"'
            }
            multipleLocationPopupHtml += 
            'class="multiple-location__icon" src="' + 
            locationIconAndInfo.icon + '">' +
            '<td class="multiple-location-td">' + 
            '<p class="multiple-location-td__info font-weight-500" id="' +  locationIconAndInfo.id + '"title=' + locationIconAndInfo.layerName + '>' + locationIconAndInfo.name + '</p>' + 
              '<p class="multiple-location-td__info " id="' + locationIconAndInfo.id + '"title=' + locationIconAndInfo.layerName + '>' + locationIconAndInfo.address + '</p></td>'
          multipleLocationPopupHtml += '</tr>'
          });
        });
        multipleLocationPopupHtml += '</table>';
        // view.popup.open({
        //   title: 'Nearby Location',
        //   // location: currPopupLocation,
        //   content: 'hi'
        // });

        // view.popup.content = multipleLocationPopupHtml;
        var multplePopupItem = {
          popupTemplate: {
            title: '',
            content: multipleLocationPopupHtml
          }
        }
        view.popup.open({
          features: [multplePopupItem]
        })
      },

      /*
        Listen for clicking on alert button to display message. Also reconfig css color
      */
      listenForMobileAlert: function () {
        $(uiSelectors.alertMobile).click(function () {
          var disclaimerMessage = '<div id="alert-message-mobile">Map Layers include 600 ft buffers aroud the property. Use this map only as an estimate <br><br> <a href="https://sfplanning.org/location-and-hours" class="contact-planning">Contact SF Planning</a> to confirm eligibility of a location</div>';
          $(uiSelectors.modalHeader).css('background', 'white');
          $(uiSelectors.modalHeader).css('border-bottom', 'none')
          $(uiSelectors.closeModal).css('color', '#1C3E57');

          $(uiSelectors.modalBody).html(disclaimerMessage);
          $(uiSelectors.modalTitle).html('');
          $(uiSelectors.modalDisplay).modal('show');
        });
      },

      /*  
        Change legend and location logo to default colors
      */
      resetMobileTabLogosToDefault: function () {
        $('#locations-logo').attr('src', 'images/Location.svg')
        $('#legend-logo').attr('src', 'images/legend.svg');
      },

      /*
        adds box shadow if there is scrolling
      */
      listenForLegendAccordionToggle: function () {
        $(uiSelectors.zoningDescription)
          .on('shown.bs.collapse', function () {
            var legendTabHeight = $('#mobile-selected-tab').height();
            if (legendTabHeight > initialLegendTabHeight) {
              $(uiSelectors.tabDisplayContainer).css('box-shadow', 'inset 0px -40px 41px -44px rgba(0,0,0,0.2)')
            }
          })
          .on('hidden.bs.collapse', function () {
            var legendTabHeight = $('#mobile-selected-tab').height();
            if (legendTabHeight <= initialLegendTabHeight) {
              $(uiSelectors.tabDisplayContainer).css('box-shadow', 'inset 0px -40px 41px -44px rgba(0,0,0,0)')
            }
          })
      },


      /*
        Add box shadow to the location menu tab on mobile. 
          - box shadow will dissapear when at bottom of scroll
          - box shadow will reappear when there is scroll
      */
      listenForScrollingForLocationMenu: function () {
        $(uiSelectors.mobileFilterContainer).scroll(function () {
          if (Math.ceil($(this).scrollTop()) + Math.ceil($(uiSelectors.mobileFilterContainer).height()) === this.scrollHeight) {
            // at bottom of scroll
            // $(this).css('box-shadow', 'inset 0px 40px 41px -44px rgba(0,0,0,0.75)')
            $(this).css('box-shadow', 'inset 0px 40px 41px -44px rgba(0,0,0,0)')

          } else if ($(this).scrollTop() + $(this).height() === $(uiSelectors.mobileFilterContainer).height()) {
            // at top of scroll
            $(this).css('box-shadow', 'inset 0px -40px 41px -44px rgba(0,0,0,0.2)')

          } else if (Math.ceil($(this).scrollTop()) + Math.ceil($(uiSelectors.mobileFilterContainer).height()) < this.scrollHeight) {
            // at between top and bottom scroll
            // $(this).css('box-shadow', 'inset 0px 40px 41px -44px rgba(0,0,0,0.75), inset 0px -40px 41px -44px rgba(0,0,0,0.75)')
            $(this).css('box-shadow', 'inset 0px -40px 41px -44px rgba(0,0,0,0.2)')

          }
        });
      },


      /*
        Display disclaimer message when clicked on alert icon
      */
      displayMobileDisclaimer: function () {
        var disclaimerMessage = 'Map Layers include 600 ft buffers aroud the property. Use this map only as an estimate <br><br> Contact SF Planning to confirm eligibility of a location';
        this.displayModal('', disclaimerMessage)
      },

      /*
        Change legend and locations tab to use inactive icons
      */
      changeMobileTabsToNonActiveColors: function () {
        var legendTabs = document.getElementsByClassName('legend-element');
        var legendArr = Array.from(legendTabs);
        legendArr.forEach(function (legend) {
          legend.classList.remove('selected');
        });
        $('#legend-logo').attr('src', 'images/legend.svg');
        $('#locations-logo').attr('src', 'images/Location.svg');
      },

      /*
        Recalculate map height with just legend and location tab
      */
      changeMapHeightAndHandleTabDisplay: function (popupIsVisible) {
        var contentContainerHeight = $(uiSelectors.contentContainer).height();
        var tabHeightsAtBottomOfScreen = 60;

        if (popupIsVisible) {
          var popupHeight = $(uiSelectors.esriPopupContainer).height();
          var newMapHeight = contentContainerHeight - popupHeight - tabHeightsAtBottomOfScreen;
        } else {
          var newMapHeight = contentContainerHeight - tabHeightsAtBottomOfScreen;
        }

        $(uiSelectors.tabDisplayContainer).css('display', 'none');
        var tabDisplayContainerChildren = $(uiSelectors.tabsContainer).children();
        for (var i = 0; i < tabDisplayContainerChildren.length; i++) {
          tabDisplayContainerChildren[i].classList.remove('selected');
        }
        
        $(uiSelectors.mapContainer).css('height', newMapHeight.toString());
      },

      /*
        Reposition footer to top of popup
      */
      changePopFooterForMobile: function () {
        var esriPopupFooter = $('.esri-popup__footer--has-actions');
        esriPopupFooter.css({
          'position': 'absolute',
          'width': '100%',
          'top': '-46px',
          'border-bottom-right-radius': '0px',
          'border-bottom-left-radius': '0px'
        })
      },

      /*
        Change map height to be entire content - mobile menu
      */
      changeToNewMapHeight: function () {
        var mobileMenuHeight = $('.menu-mobile').height();
        var contentContainerHeight = $('.content-container').height();
        var newMapHeight = contentContainerHeight - mobileMenuHeight;
        $('.map-container').css('height', newMapHeight.toString());
      },

      showLegendOnMobileTab: function () {
        $(uiSelectors.mobileLegend).css('display', 'block');
        $(uiSelectors.filterContainer).css('display', 'none');
      },

      showFilterOnMobileTab: function () {
        $(uiSelectors.mobileLegend).css('display', 'none');
        $(uiSelectors.filterContainer).css('display', 'block');
      },
    }
  }();


  var App = function () {
    var GEOCODER_URL = protocol + '://sfplanninggis.org/cpc_geocode/?search=';
    var uiSelectors = UICtrl.getUiSelectors();

    function showPopupChoices(searchResponse) {
      $(uiSelectors.modalHeader).css('background', '#1C3E57');
      $(uiSelectors.closeModal).css('color', 'white');
      var modalHtml = '';
      var featureNum = searchResponse.features.length;
      var multipleResultTitleStr = 'Multiple Results';
      if (isOnMobileHelper()) {
        $(uiSelectors.modalTitle).css('font-size', '15px');
      }

      for (var i = 0; i < featureNum; i++) {
        var currCannabisBusinessName = searchResponse.features[i].attributes.dba_name;
        var currCannabisAddressString = searchResponse.features[i].attributes.address;
        var cannabisId = searchResponse.features[i].attributes.OBJECTID;
        modalHtml += "<div id='" + cannabisId + "'class='messi-button-container'><button class='btn btn-sm multiple-business-selection'><p class=multiple-business-selection__name>" + currCannabisBusinessName + ':</p><p class =multiple-business-selection__address>' + currCannabisAddressString + "</p></button></div>"
      }
      UICtrl.displayModal(multipleResultTitleStr, modalHtml);
    }

    function searchByGeocoder(searchStr) {
      var bufferColor = {
        type: 'simple-fill',
        color: [146, 148, 150, 0.25],
        style: 'solid',
        outline: {
          color: [79, 102, 238, 1],
          width: 2
        }
      }
      return SearchCtrl.getGeocoderResponse(searchStr)
      .then(function (geocodeJsonResponse) {
        if (geocodeJsonResponse !== '') {
          var jsonResponseCopy = JSON.parse(geocodeJsonResponse);
          var features = jsonResponseCopy.features;
          var featureLength = features.length;
          if (featureLength > 0) {
            jsonResponseCopy.type = 'polygon';
            var searchType = 'searchingByGeocoder';
            var geometryToBuffer = jsonResponseCopy.features[0].geometry;
            var tempPolygon = new Polygon(geometryToBuffer);
            var centerOfGeometry = tempPolygon.extent.center;

            MapCtrl.setCurrPopupLocation(centerOfGeometry);
            var bufferedGeometry =  MapCtrl.addBufferAroundSearchPolygon(geometryToBuffer);
            MapCtrl.zoomIntoGeometry(bufferedGeometry);
            // get items inside parcel and reassign to variable listOfItemsInsideBuffer
            MapCtrl.getItemsInsideParcelBuffer(bufferedGeometry)
            .then(function(response) {
              
              var listOfMatches = response.filter(function(eachResponse) {
                return eachResponse.features.length !== 0;
              });
              
              MapCtrl.setListOfItemsInsideParcelBuffer(listOfMatches);
              MapCtrl.addGraphicToView(bufferedGeometry, bufferColor);
              MapCtrl.addSearchPolygonToMapAndPopup(jsonResponseCopy, searchType);
            })
            
            return true;
          }
        } else {
          return false;
        }
      });
    }

    function searchByAddressInGISData(searchStr) {
      var bufferColor = {
        type: 'simple-fill',
        color: [146, 148, 150, 0.25],
        style: 'solid',
        outline: {
          color: [79, 102, 238, 1],
          width: 2
        }
      }
      return SearchCtrl.getSearchByAddressResponsePromise(searchStr)
      .then(function (response) {
        var jsonResponseCopy = response;
        var features = response.features;
        var numOfFeatures = features.length;
        if (numOfFeatures > 1) {
          showPopupChoices(response);
          return true;
        } else if (numOfFeatures === 1) {
          var cannabisRetailName = jsonResponseCopy.features[0].attributes.dba_name;
          var geometryToBuffer = jsonResponseCopy.features[0].geometry;
          var bufferedGeometry =  MapCtrl.addBufferAroundSearchPolygon(geometryToBuffer);
          var centerOfGeometry = geometryToBuffer.extent.center;
          MapCtrl.setCurrPopupLocation(centerOfGeometry);
          MapCtrl.zoomIntoGeometry(bufferedGeometry);
          MapCtrl.getItemsInsideParcelBuffer(bufferedGeometry)
          .then(function(response) {
            var listOfMatches = response.filter(function(eachResponse) {
              return eachResponse.features.length !== 0;
            });

            MapCtrl.setListOfItemsInsideParcelBuffer(listOfMatches);
            MapCtrl.addGraphicToView(bufferedGeometry, bufferColor);
            MapCtrl.addSearchPolygonToMapAndPopup(jsonResponseCopy, 'searchingByAttributeTable', cannabisRetailName);
          });
          return true;
        } else {
          return false;
        }
      })
    }

    function searchByNameInGISData(searchStr) {
      var bufferColor = {
        type: 'simple-fill',
        color: [146, 148, 150, 0.25],
        style: 'solid',
        outline: {
          color: [79, 102, 238, 1],
          width: 2
        }
      }      
      searchStr = searchStr.replace(/[\u2018\u2019]/g, "'");
      return SearchCtrl.getSearchByStoreNameResponsePromise(searchStr)
      .then(function (response) {
        var features = response.features;
        var numOfFeatures = features.length;
        var jsonResponseCopy = response;
        if (numOfFeatures > 1) {
          showPopupChoices(response);
          cancelSpinner();
          return true;
        } else if (numOfFeatures === 1) {
          var cannabisRetailName = response.features[0].attributes.dba_name;
          var geometryToBuffer = jsonResponseCopy.features[0].geometry;
          var bufferedGeometry =  MapCtrl.addBufferAroundSearchPolygon(geometryToBuffer);
          var centerOfGeometry = geometryToBuffer.centroid;
          MapCtrl.setCurrPopupLocation(centerOfGeometry);
          MapCtrl.zoomIntoGeometry(bufferedGeometry);
          MapCtrl.getItemsInsideParcelBuffer(bufferedGeometry)
          .then(function(bufferResponse) {
            // Get rid of features of length 0
            var listOfMatches = bufferResponse.filter(function(eachResponse) {
              return eachResponse.features.length !== 0;
            });

            MapCtrl.setListOfItemsInsideParcelBuffer(listOfMatches);
            MapCtrl.addGraphicToView(bufferedGeometry, bufferColor);
            MapCtrl.addSearchPolygonToMapAndPopup(response, 'searchingByAttributeTable', cannabisRetailName);
          });
          return true;
        } else {
          return false;
        }
      })
    }

    /*
      This function handles the searching iterations. 
    */
    function handleSearching(searchStr) {
      MapCtrl.clearGraphicLayers();
      // MapCtrl.resetInitialNHoodOrDistrictSelections();
      searchByGeocoder(searchStr)
      .then(function (geocodeSuccess) {
        return geocodeSuccess;
      })
      .then(function (geocodeSucess) {
        if (geocodeSucess) {
          UICtrl.resetMobileTabLogosToDefault();
          return Promise.reject('');
        } else {
          searchByAddressInGISData(searchStr)
          .then(function (searchByAddressSuccess) {
            if (!searchByAddressSuccess) {
              searchByNameInGISData(searchStr)
              .then(function (searchByNameSuccess) {
                if (searchByNameSuccess) {
                  UICtrl.resetMobileTabLogosToDefault();
                  return Promise.reject('');
                } else {
                  var uiSelectors = UICtrl.getUiSelectors();
                  var bodyDisplayStr = 'Please try again';
                  var titleDisplayStr = 'No results found';
                  UICtrl.displayModal(titleDisplayStr, bodyDisplayStr);
                  $(uiSelectors.modalHeader).css('background', '#1C3E57');
                  $(uiSelectors.modalTitle).css('font-size', '20px');

                  cancelSpinner();
                }
              });
            } else {
              UICtrl.resetMobileTabLogosToDefault();
            }
          });
        }
      })
      .catch(function(err) {
        if (err) {
          var title = 'Error';
          var bodyStr = 'There has been an error. Please contact CPC.GIS@sfgov.org';
          UICtrl.displayModal(title, bodyStr);
        }
      });
    }

    function sortByAttributeName(item1, item2) {
      var attribute1 = item1.attributes["supervisor"];
      var attribute2 = item2.attributes["supervisor"];
      return attribute1 < attribute2 ? -1 : 1;
    }

    

    function popuplateNeighborhoods() {
      var neighborhoodList = $(uiSelectors.neighborhoodList);
      var neighborhoodListGetRequestUrl = 'http://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer/21/query?where=NEIGHBORHOOD+like+%27%25%25%27&text=&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&relationParam=&outFields=&returnGeometry=true&returnTrueCurves=true&maxAllowableOffset=&geometryPrecision=&outSR=&having=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=&resultRecordCount=&queryByDistance=&returnExtentOnly=false&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&featureEncoding=esriDefault&f=json'

      $.get(neighborhoodListGetRequestUrl, function (data, status) {
        var listOfNeighborhoods = data.features;
        var sortedNeighborhoods = listOfNeighborhoods.sort(sortByNeighborhoodName);
        sortedNeighborhoods.forEach(function (eachFeature) {
          var currNeighborhoodHtml = '<li class="each-neighborhood">District ' + eachFeature.attributes.NEIGHBORHOOD + '</li>'
          neighborhoodList.append(currNeighborhoodHtml)
        });
      })
    }

    function populateSupervisorList() {
      var supervisorList = $(uiSelectors.supervisorList);
      var supervisorListMobile = $(uiSelectors.supervisorListMobile);
      var supervisorListRequestUrl = 
        protocol + '://sfplanninggis.org/arcgiswa/rest/services/CannabisRetail/MapServer/2/query?where=%281%3D1%29&text=&objectIds=&time=&geometry=&geometryType=esriGeometryPolygon&inSR=&spatialRel=esriSpatialRelIntersects&relationParam=&outFields=*&returnGeometry=false&returnTrueCurves=false&maxAllowableOffset=&geometryPrecision=&outSR=&having=&returnIdsOnly=false&returnCountOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&gdbVersion=&historicMoment=&returnDistinctValues=false&resultOffset=&resultRecordCount=&queryByDistance=&returnExtentOnly=false&datumTransformation=&parameterValues=&rangeValues=&quantizationParameters=&featureEncoding=esriDefault&f=json'
      $.get(supervisorListRequestUrl, function(data) {
        var listOfSupervisor = data.features;
        var sortedSupervisorList = listOfSupervisor.sort(sortByAttributeName);
        sortedSupervisorList.forEach(function(eachFeature) {
          var currAttribute = eachFeature.attributes;
          var currNeighborhoodHtml = 
            '<li class="each-supervisor">District ' + 
            currAttribute.supervisor + ' - ' + 
            currAttribute.supname + '</li>'
          supervisorList.append(currNeighborhoodHtml);
          supervisorListMobile.append(currNeighborhoodHtml);
        })
      })
  
    }

    function isOnMobileHelper() {
      var windowWidth = window.innerWidth;
      return windowWidth < 544 ? true : false;
    }

    function hideMobileMenu() {

    }

    function handleClickingMultipleResult(clickedBusinessName, clickedBusinessAddress,
      searchType, currIDName) {
      var bufferColor = {
        type: 'simple-fill',
        color: [146, 148, 150, 0.25],
        style: 'solid',
        outline: {
          color: [79, 102, 238, 1],
          width: 2
        }
      }
      MapCtrl.searchByIdInCannabisTable(clickedBusinessName, clickedBusinessAddress, searchType, currIDName)
      .then(function (response) {
        var nameOfTobaccoRetail = response.features[0].attributes.dba_name;
        var geometryToBuffer = response.features[0].geometry;
        var centerOfGeometry = geometryToBuffer.extent.center;
        var bufferedGeometry =  MapCtrl.addBufferAroundSearchPolygon(geometryToBuffer);
        MapCtrl.setCurrPopupLocation(centerOfGeometry);
        MapCtrl.zoomIntoGeometry(bufferedGeometry)
        MapCtrl.getItemsInsideParcelBuffer(bufferedGeometry)
        .then(function(bufferResponse) {
          // Get rid of features of length 0
          var listOfMatches = bufferResponse.filter(function(eachResponse) {
            return eachResponse.features.length !== 0;
          });


          MapCtrl.setListOfItemsInsideParcelBuffer(listOfMatches);
          MapCtrl.addGraphicToView(bufferedGeometry, bufferColor);
          MapCtrl.addSearchPolygonToMapAndPopup(response, 'searchingByAttributeTable', nameOfTobaccoRetail);
        });
        document.querySelector('.close').click();
      });
    }

    // function showMobileMenu

    function listenForEvents() {
      var uiSelectors = UICtrl.getUiSelectors();

      $(uiSelectors.searchBox).submit(function (event) {
        callLoadSpinner();
        event.preventDefault();
        var searchString = $('#addressInput').val();
        $('#addressInput').blur();
        MapCtrl.closePopup();
        handleSearching(searchString)
      });

      $('input[type=checkbox]').change(function (event) {
        MapCtrl.updateLayerVisibility(event);
      });



      document.addEventListener('click', function (event) {
        var multipleSelectionOption = 'multiple-business-selection';
        var multipleSelectionOptionName = 'multiple-business-selection';
        var multipleSelectionOptionAddress = 'multiple-business-selection__address'
        var currClassName = event.target.className;
        var clickedItemTextContent = event.target.textContent;
        var clickedBusinessName = clickedItemTextContent.split(':')[0];
        var clickedBusinessAddress = clickedItemTextContent.split(':')[1];
        var parentElement = event.target.parentElement;
        var parentElementClassName = parentElement.className;
        var clickedOnMultipleLocationOption = currClassName.indexOf('multiple-location-td') !== -1 || parentElementClassName.indexOf('multiple-location-td__info') !== -1;

        var clickedOnClosePopupButton = currClassName.indexOf('esri-popup__button') !== -1 ||
        currClassName.indexOf('esri-popup__icon esri-icon-close') !== -1
        
        /*
          Clicking on search button
        */
        if (currClassName.indexOf('btn-search') !== -1 || currClassName.indexOf('fa-search') !== -1 || currClassName.indexOf('input-group-append') !== -1) {
          var searchStr = $('#addressInput').val();
          callLoadSpinner();
          MapCtrl.closePopup();
          handleSearching(searchStr);
        }

        if (clickedOnClosePopupButton && PopupCtrl.clickedOnMultiLocationAlready()) {
          var popupArrayFromSearch = PopupCtrl.getPopupForSearch();
          MapCtrl.showPopup(popupArrayFromSearch);
          PopupCtrl.setClickedOnMultiLocation(false);
        }

        /*
          Reshow search popups after closing on near by location list
        */
        if (clickedOnClosePopupButton) {
          if (isOnMobileHelper()) {
            UICtrl.changeToNewMapHeight();
          }
        }

        /*
          clicked on supervisor in list
        */
        if (currClassName.indexOf('each-supervisor') !== -1) {
          var supervisorName = event.target.innerHTML;
          UICtrl.hideMobileMenu();
          UICtrl.changeMobileTabsToNonActiveColors();
          MapCtrl.turnOnCheckboxesBesides(['neighborhood', 'schools']);

          MapCtrl.setSupervisorLayerOn(true);
          MapCtrl.removeAllGraphicsInView();
          MapCtrl.removeSupervisorLayer();
          MapCtrl.handleSupervisorListSelection(supervisorName)
          .then(function() {
            MapCtrl.addSupervisorLayer();
          });
          MapCtrl.setNeighborhoodLayerIsOn(false);
          MapCtrl.turnOnOtherLayersBesides('Neighborhoods_Project', 'Supervisors_2012_Project');
          MapCtrl.removeNeighborHoodLayer();
          MapCtrl.removeSearchPolygon();
          MapCtrl.turnOffLayer([
            'SchoolsPublicPrivateDec2015_600ftBuffer_KThru12', 'SchoolsPublicPrivateDec2015_KThru12'
          ]);
        }

        if (currClassName.indexOf('show-nearby-locations') !== -1) {
          $('.esri-popup__footer').css('display', 'none')
          PopupCtrl.setClickedOnMultiLocation(true);
          UICtrl.showNearByLocationOnPopup(event);
        }

        if (clickedOnMultipleLocationOption) {
          if (isOnMobileHelper()) {
            UICtrl.changeMapHeightAndHandleTabDisplay();
          }
          MapCtrl.handleNearbyLocationOptionClick(event);
        }

        var clickedOnListItemInPopup = currClassName.indexOf('esri-popup__feature-menu-item') !== -1 || currClassName.indexOf('esri-popup__feature-menu-title') !== -1 || currClassName.indexOf('esri-icon-check-mark') !== -1 || currClassName.indexOf('esri-popup__feature-menu-title') !== -1 || parentElementClassName.indexOf('esri-popup__feature-menu-title') !== -1;
        if (clickedOnListItemInPopup) {
          $('.esri-popup__main-container').css({ 'border-top-right-radius': '8px', 'border-top-left-radius': '8px' })
          $('.esri-popup__pagination-previous').css({ 'margin-left': '0px' });
          $('.esri-popup__pagination-next').css({ 'margin-right': '0px' });
        }


        // User has selected on a choice at this point
        var currIdName;
        var searchType = 'findByExactMatch'

        if ((currClassName.indexOf(multipleSelectionOption) !== -1) && (parentElementClassName === 'messi-button-container')) {
          currIDName = parentElement.id;

          handleClickingMultipleResult(
            clickedBusinessName, clickedBusinessAddress, searchType, currIDName
          )
          /*  
            Cannabis id is used for searching
          */

        } else if(currClassName.indexOf(multipleSelectionOptionName) !== -1 ||
          currClassName.indexOf(multipleSelectionOptionAddress) !== -1)
        {
          currIDName = parentElement.parentElement.id;
          searchType = 'findByExactMatch';
          handleClickingMultipleResult(
            clickedBusinessName, clickedBusinessAddress, searchType, currIDName
          )
        }

        // cancel spinner when closing messi diablog
        if (currClassName === 'messi-closebtn') {
          cancelSpinner()
        }

        if (currClassName === 'close' || parentElementClassName === 'close') {
          var popup = document.querySelector('.modal-content');
          if (popup) {
            cancelSpinner();
          }
        }
      })
    }

    function toggleCheckboxHelper (id, bool) {
      $(id).prop("checked", bool);
    }

    return {
      isOnMobile: function () {
        return isOnMobileHelper();
      },

      toggleCheckbox: function(id, bool) {
        toggleCheckboxHelper(id, bool);
      },

      init: function () {
        $(document).ready(function () {

          var meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=device-width,height='+window.innerHeight+', initial-scale=1.0';
          document.getElementsByTagName('head')[0].appendChild(meta);

          listenForEvents();
          UICtrl.listenForScrollingForLocationMenu();
          UICtrl.listenForLegendAccordionToggle();
          UICtrl.listenForMobileAlert();
          // popuplateNeighborhoods();
          populateSupervisorList();

          // var isCCSFUrl = 'https://sfplanninggis.org/IsCCSF/IsCCSF.php';
          
          // $.get(isCCSFUrl, function(isCCSF, status) {
          //   if (isCCSF == 'true') {
          //     $('.content-container').css("display", "flex");
          //     $('.right-side-nav').css("display", "block")

          //   } else {
          //     $('.not-available').css("display", "block");
          //   }
          // })
        })
        if (this.isOnMobile()) {
          $('#addressInput')[0].placeholder = 'Search';
        } else {
          $('#addressInput')[0].placeholder = 'Search for an address, business name, or parcel number';
        }
      },
    }
  }();
  App.init();
});

function callLoadSpinner() {
  $('#spinnerLargeMap').show();
  $('#map').addClass('disabledDIV');
}

function cancelSpinner() {
  $('#spinnerLargeMap').hide();
  $('#map').removeClass('disabledDIV');
}

function highLightTabClicked(event) {
  var imageChild = event.querySelector('img');
  var imageId = imageChild.id;
  var imageSrc = document.querySelector('#' + imageId).getAttribute('src');
  var legendAlreadySelected = event.classList.contains('selected')
  if (legendAlreadySelected) {
    var nonActiveLogoSrc = imageSrc.replace('-active', '');
    $('#' + imageId).attr('src', nonActiveLogoSrc);
    $('.tab-display-container').css('display', 'none');
    event.classList.remove('selected');

  } else {
    var legendElements = $('.legend-element');
    $('.tab-display-container').css('display', 'block');
    for (var i = 0; i < legendElements.length; i++) {
      legendElements[i].classList.remove('selected');
    }
    event.classList.add('selected');
  }
}

function showLegendOnMobileTab() {
  $('#mobile-legend').css('display', 'block');
  $('#filter-container').css('display', 'none');
  $('#legend-logo').attr('src', 'images/legend-active.svg');
  $('#locations-logo').attr('src', 'images/Location.svg');
}

function showFilterOnMobileTab() {
  $('#mobile-legend').css('display', 'none');
  $('#filter-container').css('display', 'block');
  $('#locations-logo').attr('src', 'images/Location-active.svg')
  $('#legend-logo').attr('src', 'images/legend.svg');
}